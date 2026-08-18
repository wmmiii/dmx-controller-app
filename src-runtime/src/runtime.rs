use dmx_engine::beat::BeatSampler;
use dmx_engine::project;
use std::sync::Arc;
use std::sync::Mutex as StdMutex;

use crate::artnet::ArtnetState;
use crate::beat::SharedBeatSampler;
use crate::events::EventSink;
use crate::output_loop::OutputLoopManager;
use crate::project_store::ProjectStore;
use crate::sacn::SacnState;
use crate::serial::SerialState;
use crate::wled::WledState;

#[cfg(feature = "visualizer")]
use tokio::sync::Mutex;

#[cfg(feature = "visualizer")]
use crate::ddp::DdpState;
#[cfg(feature = "visualizer")]
use crate::display_loop::DisplayLoopManager;
#[cfg(feature = "visualizer")]
use crate::shader::{self, ShaderState};

#[cfg(feature = "midi")]
use crate::midi::MidiState;

#[cfg(feature = "audio")]
use crate::audio_input::AudioInputState;

pub struct RuntimeConfig {
    pub events: Arc<dyn EventSink>,
    /// `None` makes the runtime read-only: the project is never written back.
    pub persist: Option<Arc<dyn ProjectStore>>,
    pub enable_visualizer: bool,
    pub enable_audio: bool,
    pub enable_midi: bool,
}

/// Construct with [`Runtime::start`] once the project is already in the
/// engine — the loops read it as soon as they spin up.
pub struct Runtime {
    pub events: Arc<dyn EventSink>,
    pub beat_sampler: SharedBeatSampler,

    serial: Arc<SerialState>,
    sacn: Arc<SacnState>,
    artnet: Arc<ArtnetState>,
    wled: Arc<WledState>,
    output_loops: Arc<OutputLoopManager>,

    #[cfg(feature = "visualizer")]
    ddp: Arc<Mutex<DdpState>>,
    #[cfg(feature = "visualizer")]
    display_loops: Arc<DisplayLoopManager>,
    /// `None` when the visualizer is disabled or GPU initialization failed.
    #[cfg(feature = "visualizer")]
    pub shader: Option<Arc<StdMutex<ShaderState>>>,

    #[cfg(feature = "midi")]
    pub midi: Option<Arc<MidiState>>,
    #[cfg(feature = "audio")]
    audio: Option<Arc<AudioInputState>>,

    persist: Option<Arc<dyn ProjectStore>>,
}

impl Runtime {
    // Only ShaderState::new is awaited, so a build without it has nothing to.
    #[cfg_attr(not(feature = "visualizer"), allow(clippy::unused_async))]
    pub async fn start(config: RuntimeConfig) -> Result<Arc<Self>, String> {
        let events = config.events;
        let beat_sampler: SharedBeatSampler = Arc::new(StdMutex::new(BeatSampler::default()));

        #[cfg(feature = "midi")]
        let midi = if config.enable_midi {
            let state = Arc::new(MidiState::new(
                Arc::clone(&events),
                Arc::clone(&beat_sampler),
            ));
            state.start_device_watcher();
            Some(state)
        } else {
            None
        };

        #[cfg(feature = "audio")]
        let audio = if config.enable_audio {
            let state = Arc::new(AudioInputState::new(
                Arc::clone(&events),
                Arc::clone(&beat_sampler),
            ));
            state.start_device_watcher();
            Some(state)
        } else {
            None
        };

        let serial = Arc::new(SerialState::default());
        #[cfg(feature = "serial")]
        serial.start_port_watcher();

        let sacn = Arc::new(SacnState::new()?);
        let artnet = Arc::new(ArtnetState::new()?);
        let wled = Arc::new(WledState::new()?);

        #[cfg(feature = "visualizer")]
        let shader = if config.enable_visualizer {
            match ShaderState::new().await {
                Ok(state) => {
                    let state = Arc::new(StdMutex::new(state));
                    shader::sync_visualizer_shaders(&state);
                    Some(state)
                }
                Err(e) => {
                    log::error!("Failed to initialize GPU shader state: {e}");
                    None
                }
            }
        } else {
            None
        };

        #[cfg(feature = "visualizer")]
        let ddp = Arc::new(Mutex::new(DdpState::default()));
        #[cfg(feature = "visualizer")]
        let display_loops = Arc::new(DisplayLoopManager::new(
            Arc::clone(&events),
            shader.clone(),
        ));

        let output_loops = Arc::new(OutputLoopManager::new(Arc::clone(&events)));

        #[cfg(feature = "visualizer")]
        DisplayLoopManager::start_on_load(Arc::clone(&display_loops), Arc::clone(&ddp));

        OutputLoopManager::start_on_load(
            Arc::clone(&output_loops),
            Arc::clone(&serial),
            Arc::clone(&sacn),
            Arc::clone(&artnet),
            Arc::clone(&wled),
        );

        Ok(Arc::new(Self {
            events,
            beat_sampler,
            serial,
            sacn,
            artnet,
            wled,
            output_loops,
            #[cfg(feature = "visualizer")]
            ddp,
            #[cfg(feature = "visualizer")]
            display_loops,
            #[cfg(feature = "visualizer")]
            shader,
            #[cfg(feature = "midi")]
            midi,
            #[cfg(feature = "audio")]
            audio,
            persist: config.persist,
        }))
    }

    pub async fn rebuild_outputs(&self) -> Result<(), String> {
        self.serial.auto_bind_serial_outputs()?;

        self.output_loops
            .rebuild_all_loops(
                Arc::clone(&self.serial),
                Arc::clone(&self.sacn),
                Arc::clone(&self.artnet),
                Arc::clone(&self.wled),
            )
            .await?;

        #[cfg(feature = "visualizer")]
        {
            self.display_loops
                .rebuild_display_loop(Arc::clone(&self.ddp))
                .await?;

            // Keep the GPU in step with project.visualizers so undo/redo/load/copy
            // all stay consistent without ad-hoc compile calls in the UI.
            if let Some(shader_state) = &self.shader {
                shader::sync_visualizer_shaders(shader_state);
            }
        }

        Ok(())
    }

    pub fn persist_changes(&self) -> Result<(), String> {
        self.events.project_updated();
        self.events.undo_state_changed();

        if let Some(persist) = &self.persist {
            project::with_project(|project| {
                persist.queue_write(project);
                Ok(())
            })?;
        }

        Ok(())
    }

    pub async fn finalize_project_modification(&self) -> Result<(), String> {
        self.persist_changes()?;
        self.rebuild_outputs().await
    }

    pub async fn finalize_transient_project_modification(&self) -> Result<(), String> {
        self.events.project_updated();
        self.rebuild_outputs().await
    }

    /// Stops every loop, watcher and capture thread this runtime started, then
    /// flushes any pending write.
    ///
    /// Leaves the last rendered frame on the wire, so blackout must be set
    /// before calling this.
    pub async fn shutdown(&self) -> Result<(), String> {
        self.output_loops.stop_all().await;

        #[cfg(feature = "visualizer")]
        self.display_loops.stop_display_loop().await;

        #[cfg(feature = "serial")]
        self.serial.stop_port_watcher();

        #[cfg(feature = "midi")]
        if let Some(midi) = &self.midi {
            midi.stop_device_watcher();
        }

        #[cfg(feature = "audio")]
        if let Some(audio) = &self.audio {
            audio.stop_device_watcher();
            audio.stop_capture();
        }

        self.flush_persist();

        Ok(())
    }

    pub fn flush_persist(&self) {
        let Some(persist) = &self.persist else {
            return;
        };

        // Cloned out rather than written under the project lock, so a slow
        // disk can't stall a render.
        match project::with_project(|project| Ok(project.clone())) {
            Ok(project) => persist.flush_sync(&project),
            Err(e) => log::error!("Failed to read project for flush: {e}"),
        }
    }
}
