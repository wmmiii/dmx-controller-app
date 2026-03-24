use beat_detector::{StrategyKind, record};
/// Re-export engine types so call-sites in this crate don't need to reach
/// into `dmx_engine` directly.
pub use dmx_engine::beat::BeatSampler;

use cpal::Device;
use dmx_engine::beat::transition_beat;
use dmx_engine::project;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

use crate::project::emit_project_update;

/// Event payload for beat sampling state
#[derive(Serialize, Clone)]
struct BeatSamplingEvent {
    sampling: bool,
}

pub(crate) type SharedBeatSampler = Arc<StdMutex<TauriBeatSampler>>;

/// Wraps the platform-independent [`BeatSampler`] with async coordination
/// state that depends on the Tokio runtime.
pub struct TauriBeatSampler {
    inner: BeatSampler,
    pub sampling: bool,
}

impl TauriBeatSampler {
    pub fn new() -> Self {
        Self {
            inner: BeatSampler::new(),
            sampling: false,
        }
    }

    pub fn add_sample(&mut self, app_handle: &AppHandle, t: u64) {
        let new_beat_optional = self.inner.add_sample(t);
        self.sampling = true;

        if let Some(new_beat) = new_beat_optional {
            let _ = project::with_project_mut(|project| {
                transition_beat(project, &new_beat, t);
                Ok(())
            });
        }

        let _ = app_handle.emit("beat-sampling-state", BeatSamplingEvent { sampling: true });
        emit_project_update(app_handle, None);
    }

    pub fn set_first_beat(&mut self, app_handle: &AppHandle, t: u64) {
        let new_beat_optional = self.inner.set_first_beat(t);

        if let Some(new_beat) = new_beat_optional {
            let _ = project::with_project_mut(|project| {
                transition_beat(project, &new_beat, t);
                Ok(())
            });
        }

        // Always emit so the frontend knows detection is active
        let _ = app_handle.emit("beat-sampling-state", BeatSamplingEvent { sampling: true });
        emit_project_update(app_handle, None);
    }
}

// ---------------------------------------------------------------------------
// Audio beat detection
// ---------------------------------------------------------------------------

/// Tauri event emitted when the audio input connection status changes.
const CONNECTION_STATUS_EVENT: &str = "audio-beat-detection-status";

/// Add a beat sample for tempo detection (called from keyboard shortcut)
#[tauri::command]
#[allow(clippy::cast_possible_truncation)]
pub async fn add_beat_sample(
    app_handle: AppHandle,
    beat_sampler: State<'_, SharedBeatSampler>,
) -> Result<(), String> {
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;

    let beat_sampler = Arc::clone(&beat_sampler);
    let mut sampler = beat_sampler
        .lock()
        .map_err(|e| format!("Failed to lock beat sampler: {e}"))?;
    sampler.add_sample(&app_handle, t);

    Ok(())
}

#[derive(Serialize, Clone)]
struct AudioConnectionStatusEvent {
    device_name: String,
    connected: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AudioInputCandidate {
    pub name: String,
}

// ---------------------------------------------------------------------------
// Active detection session
// ---------------------------------------------------------------------------

/// Owns the resources for one running detection session.
struct ActiveDetection {
    device_name: String,
    keep_recording: Arc<AtomicBool>,
    _thread_handle: std::thread::JoinHandle<()>,
}

impl ActiveDetection {
    fn stop(self) {
        self.keep_recording.store(false, Ordering::Relaxed);
        // Thread exits at the next audio buffer boundary; we drop without
        // joining to avoid blocking the async watcher.
    }
}

// ---------------------------------------------------------------------------
// BeatDetectionState
// ---------------------------------------------------------------------------

pub struct BeatDetectionState {
    active: Option<ActiveDetection>,
    watcher_cancel: Option<tokio::sync::watch::Sender<bool>>,
    app_handle: AppHandle,
    beat_sampler: SharedBeatSampler,
}

impl BeatDetectionState {
    pub fn new(app_handle: AppHandle, beat_sampler: SharedBeatSampler) -> Self {
        Self {
            active: None,
            watcher_cancel: None,
            app_handle,
            beat_sampler,
        }
    }

    /// Starts the device-watcher which auto-connects/reconnects to the
    /// configured audio input device.
    pub fn start_device_watcher(&mut self, state: Arc<Mutex<BeatDetectionState>>) {
        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
        self.watcher_cancel = Some(cancel_tx);

        let app_handle = self.app_handle.clone();
        tauri::async_runtime::spawn(async move {
            device_watcher_loop(state, app_handle, cancel_rx).await;
        });

        log::info!("Audio beat detection device watcher started");
    }

    /// Returns the name of the currently connected device, if any.
    pub fn connected_device(&self) -> Option<&str> {
        self.active.as_ref().map(|a| a.device_name.as_str())
    }

    /// Connects to `device_name`, persists the choice in project settings,
    /// and starts the detection thread.  Called from the Tauri command.
    pub fn connect(&mut self, device_name: String) -> Result<(), String> {
        let device = find_device(&device_name)?;
        self.start_detection(device_name.clone(), device)?;

        let _ = project::with_project_mut(|p| {
            let audio_config = p.audio_config.get_or_insert_with(Default::default);
            audio_config.beat_detection_device = device_name;
            Ok(true)
        });
        emit_project_update(&self.app_handle, None);
        Ok(())
    }

    /// Disconnects from the current device and clears the persisted setting.
    /// Called from the Tauri command.
    pub fn disconnect(&mut self) {
        let name = self.active.as_ref().map(|a| a.device_name.clone());
        self.stop_active();

        let _ = project::with_project_mut(|p| {
            if let Some(audio_config) = p.audio_config.as_mut() {
                audio_config.beat_detection_device.clear();
            }
            Ok(true)
        });
        emit_project_update(&self.app_handle, None);

        if let Some(n) = name {
            let _ = self.app_handle.emit(
                CONNECTION_STATUS_EVENT,
                AudioConnectionStatusEvent {
                    device_name: n,
                    connected: false,
                },
            );
        }
    }

    /// Starts the detection thread for a specific device without touching
    /// project settings.  Used by the device watcher for reconnection.
    pub(crate) fn start_detection(
        &mut self,
        device_name: String,
        device: Device,
    ) -> Result<(), String> {
        self.stop_active();

        let keep_recording = Arc::new(AtomicBool::new(true));

        let app_handle = self.app_handle.clone();
        let keep_clone = Arc::clone(&keep_recording);
        let beat_sampler_clone = Arc::clone(&self.beat_sampler);

        let thread_handle = record::start_listening(
            move |_beat_info| {
                #[allow(clippy::cast_possible_truncation)]
                let Ok(t) = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                else {
                    return;
                };

                let Ok(mut sampler) = beat_sampler_clone.lock() else {
                    return;
                };

                sampler.add_sample(&app_handle, t);
            },
            Some(device),
            StrategyKind::LPF,
            keep_clone,
        )
        .map_err(|e| format!("Failed to start audio beat detection: {e}"))?;

        self.active = Some(ActiveDetection {
            device_name,
            keep_recording,
            _thread_handle: thread_handle,
        });

        Ok(())
    }

    fn stop_active(&mut self) {
        if let Some(active) = self.active.take() {
            let _ = self.app_handle.emit(
                CONNECTION_STATUS_EVENT,
                AudioConnectionStatusEvent {
                    device_name: active.device_name.clone(),
                    connected: false,
                },
            );
            active.stop();
        }
    }
}

// ---------------------------------------------------------------------------
// Device watcher
// ---------------------------------------------------------------------------

async fn device_watcher_loop(
    state: Arc<Mutex<BeatDetectionState>>,
    app_handle: AppHandle,
    mut cancel_rx: tokio::sync::watch::Receiver<bool>,
) {
    loop {
        if *cancel_rx.borrow() {
            break;
        }

        let configured = project::with_project(|p| {
            Ok(p.audio_config
                .as_ref()
                .map(|a| a.beat_detection_device.clone())
                .filter(|d| !d.is_empty()))
        })
        .unwrap_or(None);

        let available: Vec<String> = list_device_names();

        {
            let mut beat_state = state.lock().await;
            let current = beat_state.connected_device().map(str::to_owned);

            match &configured {
                Some(name) if available.contains(name) => {
                    if current.as_deref() != Some(name.as_str()) {
                        match find_device(name)
                            .and_then(|d| beat_state.start_detection(name.clone(), d))
                        {
                            Ok(()) => {
                                let _ = app_handle.emit(
                                    CONNECTION_STATUS_EVENT,
                                    AudioConnectionStatusEvent {
                                        device_name: name.clone(),
                                        connected: true,
                                    },
                                );
                                log::info!("Auto beat detection connected to '{name}'");
                            }
                            Err(e) => {
                                log::error!(
                                    "Failed to connect auto beat detection to '{name}': {e}"
                                );
                            }
                        }
                    }
                }
                Some(name) => {
                    if current.is_some() {
                        log::info!("Audio input '{name}' unavailable, disconnecting");
                        beat_state.stop_active();
                    }
                }
                None => {
                    if current.is_some() {
                        beat_state.stop_active();
                    }
                }
            }
        }

        tokio::select! {
            () = tokio::time::sleep(tokio::time::Duration::from_secs(2)) => {}
            _ = cancel_rx.changed() => {
                if *cancel_rx.borrow() {
                    break;
                }
            }
        }
    }

    log::info!("Audio beat detection watcher loop exited");
}

// ---------------------------------------------------------------------------
// Device helpers
// ---------------------------------------------------------------------------

fn list_device_names() -> Vec<String> {
    record::audio_input_device_list().into_keys().collect()
}

fn find_device(name: &str) -> Result<Device, String> {
    record::audio_input_device_list()
        .remove(name)
        .ok_or_else(|| format!("Audio input device '{name}' not found"))
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
#[allow(clippy::unnecessary_wraps)]
pub fn list_audio_inputs() -> Result<Vec<AudioInputCandidate>, String> {
    Ok(list_device_names()
        .into_iter()
        .map(|name| AudioInputCandidate { name })
        .collect())
}

#[tauri::command]
pub async fn connect_audio_input(
    device_name: String,
    state: State<'_, Arc<Mutex<BeatDetectionState>>>,
) -> Result<(), String> {
    state.lock().await.connect(device_name)
}

#[tauri::command]
pub async fn disconnect_audio_input(
    state: State<'_, Arc<Mutex<BeatDetectionState>>>,
) -> Result<(), String> {
    state.lock().await.disconnect();
    Ok(())
}
