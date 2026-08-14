use dmx_engine::beat::BeatSampler;
use dmx_engine::project;
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use tokio::sync::Mutex;

use crate::beat::SharedBeatSampler;
use crate::events::EventSink;
use crate::output_loop::OutputLoopManager;
use crate::project_store::ProjectStore;
use crate::sacn::SacnState;
use crate::serial::SerialState;
use crate::wled::WledState;

#[cfg(feature = "visualizer")]
use crate::ddp::DdpState;
#[cfg(feature = "visualizer")]
use crate::display_loop::DisplayLoopManager;
#[cfg(feature = "visualizer")]
use crate::shader::{self, ShaderState};

#[cfg(all(feature = "midi", not(target_os = "ios")))]
use crate::midi::MidiState;

#[cfg(all(feature = "audio", not(target_os = "ios")))]
use crate::audio_input::AudioInputState;

pub struct RuntimeConfig {
    pub events: Arc<dyn EventSink>,
    /// `None` makes the runtime read-only: the project is never written back.
    pub persist: Option<Arc<dyn ProjectStore>>,
    pub enable_visualizer: bool,
    pub enable_audio: bool,
    pub enable_midi: bool,
}

/// Everything needed to drive a loaded project's outputs, assembled once and
/// shared by reference. Construct with [`Runtime::start`] after the project is
/// in the engine — the loops read it as soon as they spin up.
pub struct Runtime {
    pub events: Arc<dyn EventSink>,
    pub beat_sampler: SharedBeatSampler,

    pub serial: Arc<Mutex<SerialState>>,
    pub sacn: Arc<Mutex<SacnState>>,
    pub wled: Arc<Mutex<WledState>>,
    pub output_loops: Arc<Mutex<OutputLoopManager>>,

    #[cfg(feature = "visualizer")]
    pub ddp: Arc<Mutex<DdpState>>,
    #[cfg(feature = "visualizer")]
    pub display_loops: Arc<Mutex<DisplayLoopManager>>,
    /// `None` when the visualizer is disabled or GPU initialization failed.
    #[cfg(feature = "visualizer")]
    pub shader: Option<Arc<StdMutex<ShaderState>>>,

    #[cfg(all(feature = "midi", not(target_os = "ios")))]
    pub midi: Option<Arc<Mutex<MidiState>>>,
    #[cfg(all(feature = "audio", not(target_os = "ios")))]
    pub audio: Option<Arc<Mutex<AudioInputState>>>,

    persist: Option<Arc<dyn ProjectStore>>,
}

impl Runtime {
    pub async fn start(config: RuntimeConfig) -> Result<Arc<Self>, String> {
        let events = config.events;
        let beat_sampler: SharedBeatSampler = Arc::new(StdMutex::new(BeatSampler::default()));

        #[cfg(all(feature = "midi", not(target_os = "ios")))]
        let midi = if config.enable_midi {
            let state = Arc::new(Mutex::new(MidiState::new(
                Arc::clone(&events),
                Arc::clone(&beat_sampler),
            )));
            state.lock().await.start_device_watcher(Arc::clone(&state));
            Some(state)
        } else {
            None
        };

        #[cfg(all(feature = "audio", not(target_os = "ios")))]
        let audio = if config.enable_audio {
            let state = Arc::new(Mutex::new(AudioInputState::new(
                Arc::clone(&events),
                Arc::clone(&beat_sampler),
            )));
            state.lock().await.start_device_watcher(Arc::clone(&state));
            Some(state)
        } else {
            None
        };

        let serial = Arc::new(Mutex::new(SerialState::default()));
        #[cfg(not(target_os = "ios"))]
        serial.lock().await.start_port_watcher(Arc::clone(&serial));

        let sacn = Arc::new(Mutex::new(SacnState::new()?));
        let wled = Arc::new(Mutex::new(WledState::new()?));

        #[cfg(feature = "visualizer")]
        let shader = if config.enable_visualizer {
            match ShaderState::new().await {
                Ok(state) => {
                    let state = Arc::new(StdMutex::new(state));
                    // Compile the project's visualizers before the display loop
                    // starts rendering them.
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
        let display_loops = Arc::new(Mutex::new(DisplayLoopManager::new(
            Arc::clone(&events),
            shader.clone(),
        )));

        let output_loops = Arc::new(Mutex::new(OutputLoopManager::new(Arc::clone(&events))));

        #[cfg(feature = "visualizer")]
        DisplayLoopManager::start_on_load(Arc::clone(&display_loops), Arc::clone(&ddp));

        OutputLoopManager::start_on_load(
            Arc::clone(&output_loops),
            Arc::clone(&serial),
            Arc::clone(&sacn),
            Arc::clone(&wled),
        );

        Ok(Arc::new(Self {
            events,
            beat_sampler,
            serial,
            sacn,
            wled,
            output_loops,
            #[cfg(feature = "visualizer")]
            ddp,
            #[cfg(feature = "visualizer")]
            display_loops,
            #[cfg(feature = "visualizer")]
            shader,
            #[cfg(all(feature = "midi", not(target_os = "ios")))]
            midi,
            #[cfg(all(feature = "audio", not(target_os = "ios")))]
            audio,
            persist: config.persist,
        }))
    }

    /// Reconciles the running loops with the project's current outputs.
    pub async fn rebuild_outputs(&self) -> Result<(), String> {
        {
            let serial = self.serial.lock().await;
            serial.auto_bind_serial_outputs()?;
        }

        {
            let manager = self.output_loops.lock().await;
            manager
                .rebuild_all_loops(
                    Arc::clone(&self.serial),
                    Arc::clone(&self.sacn),
                    Arc::clone(&self.wled),
                )
                .await?;
        }

        #[cfg(feature = "visualizer")]
        {
            let manager = self.display_loops.lock().await;
            manager.rebuild_display_loop(Arc::clone(&self.ddp)).await?;

            // Keep the GPU in step with project.visualizers so undo/redo/load/copy
            // all stay consistent without ad-hoc compile calls in the UI.
            if let Some(shader_state) = &self.shader {
                shader::sync_visualizer_shaders(shader_state);
            }
        }

        Ok(())
    }

    /// Announces a project change and queues it for persistence, without
    /// touching the running loops.
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

    /// Finalizes an undoable project change: announce, persist, rebuild.
    pub async fn finalize_project_modification(&self) -> Result<(), String> {
        self.persist_changes()?;
        self.rebuild_outputs().await
    }

    /// Leaves no undo entry and writes nothing to disk.
    pub async fn finalize_transient_project_modification(&self) -> Result<(), String> {
        self.events.project_updated();
        self.rebuild_outputs().await
    }

    /// Stops every loop and flushes any queued write. Leaves the last rendered
    /// frame on the wire, so blackout must be set before calling this.
    pub async fn shutdown(&self) -> Result<(), String> {
        {
            let manager = self.output_loops.lock().await;
            manager.stop_all().await?;
        }

        #[cfg(feature = "visualizer")]
        {
            let manager = self.display_loops.lock().await;
            manager.stop_display_loop().await?;
        }

        self.flush_persist();

        Ok(())
    }

    pub fn flush_persist(&self) {
        let Some(persist) = &self.persist else {
            return;
        };

        // Cloned out rather than written under the project lock, so a slow disk
        // can't stall a render mid-shutdown.
        match project::with_project(|project| Ok(project.clone())) {
            Ok(project) => persist.flush_sync(&project),
            Err(e) => log::error!("Failed to read project for flush: {e}"),
        }
    }
}
