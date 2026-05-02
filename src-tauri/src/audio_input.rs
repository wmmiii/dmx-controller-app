use cpal::Sample;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use dmx_engine::project;
use serde::Serialize;
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;

use crate::beat::SharedBeatSampler;
use crate::fft::FftAnalyzer;

#[derive(Serialize, Clone, Debug)]
pub struct AudioInputDevice {
    name: String,
}

#[derive(Serialize, Clone)]
struct AudioDeviceListChangedEvent {
    devices: Vec<AudioInputDevice>,
}

pub struct AudioInputState {
    /// Sender to stop the stream thread. Dropping or sending stops the stream.
    stream_stop_tx: StdMutex<Option<std::sync::mpsc::Sender<()>>>,
    /// Handle for the stream thread, joined during shutdown so the cpal stream
    /// is fully dropped before a new one is started.
    stream_thread: StdMutex<Option<std::thread::JoinHandle<()>>>,
    /// Name of the device currently streaming (to detect when project changes).
    active_device: StdMutex<Option<String>>,
    app_handle: StdMutex<Option<AppHandle>>,
    watcher_cancel_tx: StdMutex<Option<tokio::sync::watch::Sender<bool>>>,
}

impl AudioInputState {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            stream_stop_tx: StdMutex::new(None),
            stream_thread: StdMutex::new(None),
            active_device: StdMutex::new(None),
            app_handle: StdMutex::new(Some(app_handle)),
            watcher_cancel_tx: StdMutex::new(None),
        }
    }

    pub fn start_device_watcher(&self, state: Arc<Mutex<Self>>) {
        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
        {
            let mut watcher = self.watcher_cancel_tx.lock().unwrap();
            *watcher = Some(cancel_tx);
        }
        tauri::async_runtime::spawn(async move {
            Self::device_watcher_loop(state, cancel_rx).await;
        });
        log::info!("Audio input device watcher started");
    }

    async fn device_watcher_loop(
        state: Arc<Mutex<Self>>,
        mut cancel_rx: tokio::sync::watch::Receiver<bool>,
    ) {
        let mut known_devices: Vec<String> = Vec::new();

        loop {
            if *cancel_rx.borrow() {
                break;
            }

            if let Ok(current_devices) = list_audio_inputs() {
                let current_names: Vec<String> =
                    current_devices.iter().map(|d| d.name.clone()).collect();

                // Emit device list changes to frontend
                if current_names != known_devices {
                    let audio_state = state.lock().await;
                    if let Ok(handle_guard) = audio_state.app_handle.lock()
                        && let Some(app_handle) = handle_guard.as_ref()
                    {
                        let _ = app_handle.emit(
                            "audio-device-list-changed",
                            &AudioDeviceListChangedEvent {
                                devices: current_devices,
                            },
                        );
                    }
                    known_devices = current_names.clone();
                }

                // Read the desired device from the project proto
                let desired_device: String =
                    project::with_project(|p| Ok(p.selected_audio_input.clone()))
                        .unwrap_or_default();

                let audio_state = state.lock().await;
                let current_active = audio_state.active_device.lock().unwrap().clone();

                let desired = if desired_device.is_empty() {
                    None
                } else {
                    Some(desired_device)
                };

                match (&current_active, &desired) {
                    // No change needed
                    (a, b) if a == b => {}
                    // Need to disconnect (desired is None or changed)
                    (Some(_), None) => {
                        stop_stream(&audio_state);
                        end_audio_beat(&audio_state);
                        *audio_state.active_device.lock().unwrap() = None;
                        log::info!("Audio input deselected");
                    }
                    // Need to connect or switch device
                    (_, Some(device_name)) => {
                        // Only connect if device is currently available
                        if current_names.contains(device_name) {
                            // Stop existing stream first if switching
                            if current_active.is_some() {
                                stop_stream(&audio_state);
                            }
                            match start_stream(&audio_state, device_name) {
                                Ok(()) => {
                                    *audio_state.active_device.lock().unwrap() =
                                        Some(device_name.clone());
                                    log::info!("Audio input connected to device: {device_name}");
                                }
                                Err(e) => {
                                    log::error!(
                                        "Failed to connect to audio device '{device_name}': {e}"
                                    );
                                    end_audio_beat(&audio_state);
                                    *audio_state.active_device.lock().unwrap() = None;
                                }
                            }
                        } else if current_active.is_some() {
                            // Desired device not available, stop current stream
                            stop_stream(&audio_state);
                            end_audio_beat(&audio_state);
                            *audio_state.active_device.lock().unwrap() = None;
                            log::info!("Audio device '{device_name}' not available, disconnected");
                        }
                    }
                    // Both None — nothing to do
                    (None, None) => {}
                }
            }

            tokio::select! {
                () = tokio::time::sleep(tokio::time::Duration::from_secs(1)) => {},
                _ = cancel_rx.changed() => {
                    if *cancel_rx.borrow() {
                        break;
                    }
                }
            }
        }

        log::info!("Audio input device watcher loop exited");
    }
}

#[tauri::command]
pub fn list_audio_inputs() -> Result<Vec<AudioInputDevice>, String> {
    let host = cpal::default_host();
    let devices = host.input_devices().map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for device in devices {
        if let Ok(name) = device.name() {
            result.push(AudioInputDevice { name });
        }
    }
    Ok(result)
}

/// Mark the beat sampler as audio-inactive and notify the frontend.
/// Called whenever the audio stream stops so manual tap tempo becomes
/// available again.
fn end_audio_beat(state: &AudioInputState) {
    if let Ok(handle_guard) = state.app_handle.lock()
        && let Some(app_handle) = handle_guard.as_ref()
    {
        let beat_sampler = app_handle.state::<SharedBeatSampler>();
        if let Ok(mut sampler) = beat_sampler.lock() {
            sampler.audio_active = false;
        }
        let _ = app_handle.emit("audio-beat-active", false);
    }
}

/// Stop the current stream thread by sending a stop signal and waiting for the
/// thread to exit, ensuring the underlying cpal stream is dropped before we
/// return.
fn stop_stream(state: &AudioInputState) {
    if let Some(tx) = state.stream_stop_tx.lock().unwrap().take() {
        let _ = tx.send(());
    }
    let handle = state.stream_thread.lock().unwrap().take();
    if let Some(handle) = handle {
        let _ = handle.join();
    }
}

/// Start streaming from the named audio device on a dedicated thread.
fn start_stream(state: &AudioInputState, device_name: &str) -> Result<(), String> {
    stop_stream(state);

    let app_handle = state
        .app_handle
        .lock()
        .map_err(|e| format!("Failed to lock app handle: {e}"))?
        .as_ref()
        .ok_or("App handle not initialized")?
        .clone();

    // Activate audio beat mode: manual tap commands will be ignored until the
    // stream stops and end_audio_beat() is called.
    let beat_sampler: SharedBeatSampler = Arc::clone(&*app_handle.state::<SharedBeatSampler>());
    if let Ok(mut sampler) = beat_sampler.lock() {
        sampler.audio_active = true;
    }
    let _ = app_handle.emit("audio-beat-active", true);

    let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();
    let device_name_owned = device_name.to_string();

    // Spawn a dedicated thread that owns the cpal Stream (which is !Send).
    // The stream lives on this thread until we send a stop signal.
    let handle = std::thread::Builder::new()
        .name("audio-input-stream".into())
        .spawn(move || {
            if let Err(e) =
                run_stream_thread(&device_name_owned, app_handle, &stop_rx, beat_sampler)
            {
                log::error!("Audio input stream thread error: {e}");
            }
        })
        .map_err(|e| format!("Failed to spawn audio stream thread: {e}"))?;

    *state.stream_thread.lock().unwrap() = Some(handle);
    *state.stream_stop_tx.lock().unwrap() = Some(stop_tx);

    Ok(())
}

/// Runs on a dedicated thread. Creates the cpal stream and blocks until stop signal.
fn run_stream_thread(
    device_name: &str,
    app_handle: AppHandle,
    stop_rx: &std::sync::mpsc::Receiver<()>,
    beat_sampler: SharedBeatSampler,
) -> Result<(), String> {
    let host = cpal::default_host();
    let device = host
        .input_devices()
        .map_err(|e| e.to_string())?
        .find(|d| d.name().map(|n| n == device_name).unwrap_or(false))
        .ok_or_else(|| format!("Audio device '{device_name}' not found"))?;

    let config = device
        .default_input_config()
        .map_err(|e| format!("Failed to get default input config: {e}"))?;

    let sample_rate = config.sample_rate().0;
    let channels = config.channels() as usize;

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => build_input_stream::<f32>(
            &device,
            &config.into(),
            app_handle,
            sample_rate,
            channels,
            beat_sampler,
        )?,
        cpal::SampleFormat::I16 => build_input_stream::<i16>(
            &device,
            &config.into(),
            app_handle,
            sample_rate,
            channels,
            beat_sampler,
        )?,
        cpal::SampleFormat::U16 => build_input_stream::<u16>(
            &device,
            &config.into(),
            app_handle,
            sample_rate,
            channels,
            beat_sampler,
        )?,
        format => return Err(format!("Unsupported sample format: {format:?}")),
    };

    stream
        .play()
        .map_err(|e| format!("Failed to start audio stream: {e}"))?;

    // Block until stop signal. When the sender is dropped or sends, we exit,
    // which drops the stream and stops capture.
    let _ = stop_rx.recv();

    Ok(())
}

fn build_input_stream<T: cpal::SizedSample + Send + 'static>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    app_handle: AppHandle,
    sample_rate: u32,
    channels: usize,
    beat_sampler: SharedBeatSampler,
) -> Result<cpal::Stream, String>
where
    f32: cpal::FromSample<T>,
{
    // 2048 gives ~21.5 Hz bin resolution at 44.1 kHz / ~23.4 Hz at 48 kHz,
    // ensuring every logarithmic band (down to ~40 Hz) contains at least one
    // bin. 1024 was too coarse — at 48 kHz it left a gap around 60–87 Hz that
    // missed band 1 entirely. Latency cost: ~43ms per frame vs ~21ms.
    const FFT_SIZE: usize = 2048;

    let analyzer = Arc::new(StdMutex::new(FftAnalyzer::new(FFT_SIZE, sample_rate)));

    let stream = device
        .build_input_stream(
            config,
            #[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation)]
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                let Ok(mut analyzer) = analyzer.lock() else {
                    return;
                };

                // Mix to mono and feed into analyzer.
                for frame in data.chunks(channels) {
                    let mono: f32 =
                        frame.iter().map(|&s| f32::from_sample(s)).sum::<f32>() / channels as f32;

                    if let Some(analysis) = analyzer.push_sample(mono) {
                        // Bass beat detected: feed timestamp into the BPM tracker,
                        // mirroring the manual tap-tempo path so the render engine
                        // stays beat-synchronised to the incoming audio.
                        if analysis.beat_bass {
                            if let Ok(t) = SystemTime::now()
                                .duration_since(UNIX_EPOCH)
                                .map(|d| d.as_millis() as u64)
                                && let Ok(mut sampler) = beat_sampler.lock()
                            {
                                sampler.add_sample(&app_handle, t);
                            }
                        }

                        let _ = app_handle.emit("audio-input-analysis", &analysis);
                        dmx_engine::audio::update_audio_analysis(analysis);
                    }
                }
            },
            |err| {
                log::error!("Audio input stream error: {err}");
            },
            None,
        )
        .map_err(|e| format!("Failed to build input stream: {e}"))?;

    Ok(stream)
}
