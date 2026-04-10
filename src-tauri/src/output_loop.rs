use dmx_engine::project;
use dmx_engine::proto::output::Output as ProtoOutput;
use dmx_engine::render::render::{RenderError, render_dmx, render_wled};
use prost::Message;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use crate::sacn::SacnState;
use crate::serial::SerialState;
use crate::wled::WledState;

// Default FPS for each output type when not specified
const DEFAULT_SERIAL_FPS: u32 = 44;
const DEFAULT_SACN_FPS: u32 = 44;
const DEFAULT_WLED_FPS: u32 = 42;

// Event payloads for rendering results
#[derive(Clone, Serialize)]
struct DmxRenderEvent {
    output_id: String,
    data: Vec<u8>,
}

#[derive(Clone, Serialize)]
struct WledRenderEvent {
    output_id: String,
    data: Vec<u8>,
}

#[derive(Clone, Serialize)]
struct RenderErrorEvent {
    output_id: String,
    message: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum OutputType {
    Serial {
        fps: u32,
    },
    Sacn {
        universe: u16,
        ip_address: String,
        fps: u32,
    },
    Wled {
        ip_address: String,
        fps: u32,
    },
}

struct OutputLoopHandle {
    task: JoinHandle<()>,
    cancel_tx: tokio::sync::watch::Sender<bool>,
    output_type: OutputType,
}

pub struct OutputLoopManager {
    loops: Arc<Mutex<HashMap<u64, OutputLoopHandle>>>,
    app: AppHandle,
}

impl OutputLoopManager {
    pub fn new(app: AppHandle) -> Self {
        OutputLoopManager {
            loops: Arc::new(Mutex::new(HashMap::new())),
            app,
        }
    }

    /// Starts output loops for the currently loaded project.
    /// Should be called after app startup to begin DMX output.
    pub fn start_on_load(
        manager: Arc<Mutex<Self>>,
        serial_state: Arc<Mutex<SerialState>>,
        sacn_state: Arc<Mutex<SacnState>>,
        wled_state: Arc<Mutex<WledState>>,
    ) {
        tauri::async_runtime::spawn(async move {
            let manager = manager.lock().await;
            if let Err(e) = manager
                .rebuild_all_loops(serial_state, sacn_state, wled_state)
                .await
            {
                log::error!("Failed to start output loops on startup: {e}");
            }
        });
    }

    pub async fn start_loop(
        &self,
        output_id: u64,
        output_type: OutputType,
        serial_state: Arc<Mutex<SerialState>>,
        sacn_state: Arc<Mutex<SacnState>>,
        wled_state: Arc<Mutex<WledState>>,
    ) -> Result<(), String> {
        // Stop existing loop if running
        self.stop_loop(output_id).await?;

        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
        let loops_clone = self.loops.clone();
        let output_type_clone = output_type.clone();
        let app_clone = self.app.clone();

        let task = tokio::spawn(async move {
            if let Err(e) = Self::run_output_loop(
                output_id,
                output_type_clone,
                serial_state,
                sacn_state,
                wled_state,
                app_clone,
                cancel_rx,
            )
            .await
            {
                log::error!("Output loop {output_id} failed: {e}");
            }

            // Remove self from the map when done
            let mut loops = loops_clone.lock().await;
            loops.remove(&output_id);
        });

        let handle = OutputLoopHandle {
            task,
            cancel_tx,
            output_type,
        };

        let mut loops = self.loops.lock().await;
        loops.insert(output_id, handle);

        Ok(())
    }

    pub async fn stop_loop(&self, output_id: u64) -> Result<(), String> {
        let mut loops = self.loops.lock().await;

        if let Some(handle) = loops.remove(&output_id) {
            // Signal cancellation
            let _ = handle.cancel_tx.send(true);

            // Wait for task to finish (with timeout)
            if (tokio::time::timeout(Duration::from_millis(500), handle.task).await).is_err() {
                log::warn!("Output loop {output_id} did not stop within timeout");
            }
            Ok(())
        } else {
            Ok(()) // Already stopped
        }
    }

    pub async fn rebuild_all_loops(
        &self,
        serial_state: Arc<Mutex<SerialState>>,
        sacn_state: Arc<Mutex<SacnState>>,
        wled_state: Arc<Mutex<WledState>>,
    ) -> Result<(), String> {
        // Extract desired outputs from project (avoid holding lock during async I/O)
        let desired_outputs: HashMap<u64, OutputType> = project::with_project(|project| {
            let active_patch = project
                .patches
                .get(&project.active_patch)
                .ok_or_else(|| format!("Active patch {} not found", project.active_patch))?;

            let mut outputs = HashMap::new();
            for (output_id, output) in &active_patch.outputs {
                // Only include enabled outputs
                if !output.enabled {
                    continue;
                }

                #[allow(clippy::cast_possible_truncation)]
                let output_type = match &output.output {
                    Some(ProtoOutput::SerialDmxOutput(_)) => OutputType::Serial {
                        fps: if output.fps > 0 {
                            output.fps
                        } else {
                            DEFAULT_SERIAL_FPS
                        },
                    },
                    Some(ProtoOutput::SacnDmxOutput(sacn)) => OutputType::Sacn {
                        universe: sacn.universe as u16,
                        ip_address: sacn.ip_address.clone(),
                        fps: if output.fps > 0 {
                            output.fps
                        } else {
                            DEFAULT_SACN_FPS
                        },
                    },
                    Some(ProtoOutput::WledOutput(wled)) => OutputType::Wled {
                        ip_address: wled.ip_address.clone(),
                        fps: if output.fps > 0 {
                            output.fps
                        } else {
                            DEFAULT_WLED_FPS
                        },
                    },
                    None => continue, // Skip outputs without a type
                };
                outputs.insert(*output_id, output_type);
            }
            Ok(outputs)
        })?;

        // Get current running loops
        let current_loops = {
            let loops = self.loops.lock().await;
            loops
                .iter()
                .map(|(id, handle)| (*id, handle.output_type.clone()))
                .collect::<HashMap<_, _>>()
        };

        // Determine which loops to stop, start, or keep
        let mut to_stop = Vec::new();
        let mut to_start = Vec::new();

        // Find loops to stop (no longer in desired or changed configuration)
        for (output_id, current_type) in &current_loops {
            match desired_outputs.get(output_id) {
                Some(desired_type) if desired_type == current_type => {
                    // Keep running - configuration unchanged
                }
                _ => {
                    // Stop - either removed or configuration changed
                    to_stop.push(*output_id);
                }
            }
        }

        // Find loops to start (new or changed configuration)
        for (output_id, desired_type) in &desired_outputs {
            match current_loops.get(output_id) {
                Some(current_type) if current_type == desired_type => {
                    // Already running with correct configuration
                }
                _ => {
                    // Start - either new or configuration changed
                    to_start.push((*output_id, desired_type.clone()));
                }
            }
        }

        // Stop loops that need to be stopped
        for output_id in to_stop {
            log::info!("Stopping output loop {output_id} (removed or changed)");
            self.stop_loop(output_id).await?;
        }

        // Start new loops
        for (output_id, output_type) in to_start {
            self.start_loop(
                output_id,
                output_type,
                serial_state.clone(),
                sacn_state.clone(),
                wled_state.clone(),
            )
            .await?;
        }

        Ok(())
    }

    fn emit_error(output_id: u64, message: String, app: &AppHandle) {
        let event = RenderErrorEvent {
            output_id: output_id.to_string(),
            message,
        };
        if let Err(e) = app.emit("render-error", event) {
            log::error!("Failed to emit render error event: {e}");
        }
    }

    fn clear_error(output_id: u64, app: &AppHandle) {
        // Emit output_id string to signal clearing the error
        if let Err(e) = app.emit("render-error-clear", output_id.to_string()) {
            log::error!("Failed to emit render error clear event: {e}");
        }
    }

    fn render_and_emit_dmx(
        output_id: u64,
        system_t: u64,
        frame: u32,
        app: &AppHandle,
    ) -> Result<Vec<u8>, RenderError> {
        let dmx_data = render_dmx(output_id, system_t, frame)?;
        let dmx_vec = dmx_data.to_vec();

        // Emit render event to frontend
        let event = DmxRenderEvent {
            output_id: output_id.to_string(),
            data: dmx_vec.clone(),
        };
        if let Err(e) = app.emit("dmx-render", event) {
            log::error!("Failed to emit DMX render event: {e}");
        }

        Ok(dmx_vec)
    }

    async fn run_output_loop(
        output_id: u64,
        output_type: OutputType,
        serial_state: Arc<Mutex<SerialState>>,
        sacn_state: Arc<Mutex<SacnState>>,
        wled_state: Arc<Mutex<WledState>>,
        app: AppHandle,
        cancel_rx: tokio::sync::watch::Receiver<bool>,
    ) -> Result<(), String> {
        let target_fps = match &output_type {
            OutputType::Serial { fps }
            | OutputType::Sacn { fps, .. }
            | OutputType::Wled { fps, .. } => *fps,
        };

        let frame_duration = Duration::from_millis(1000 / u64::from(target_fps));
        let mut frame = 0u32;

        // Timing diagnostics
        let stats_interval = target_fps * 5; // Log every 5 seconds
        let mut last_frame_time = Instant::now();
        let mut late_frames = 0u32;
        let mut max_interval_ms = 0f64;
        let mut total_render_ms = 0f64;
        let mut total_output_ms = 0f64;

        log::info!("Starting output loop {output_id} ({output_type:?}) at {target_fps} FPS");

        loop {
            // Check for cancellation
            if *cancel_rx.borrow() {
                log::info!("Output loop {output_id} cancelled");
                break;
            }

            let loop_start = Instant::now();

            // Track frame interval jitter
            let frame_interval = last_frame_time.elapsed();
            let interval_ms = frame_interval.as_secs_f64() * 1000.0;
            let expected_ms = frame_duration.as_secs_f64() * 1000.0;
            if interval_ms > expected_ms * 1.5 {
                late_frames += 1;
            }
            max_interval_ms = max_interval_ms.max(interval_ms);
            last_frame_time = Instant::now();

            // Render the frame
            #[allow(clippy::cast_possible_truncation)]
            let system_t = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64;

            let result = match &output_type {
                OutputType::Serial { .. } => {
                    match Self::render_and_emit_dmx(output_id, system_t, frame, &app) {
                        Ok(dmx_vec) => {
                            let render_time = loop_start.elapsed();
                            total_render_ms += render_time.as_secs_f64() * 1000.0;

                            // Output via serial
                            let serial = serial_state.lock().await;
                            let output_result =
                                serial.output_dmx_internal(&output_id.to_string(), &dmx_vec);
                            drop(serial);

                            let output_time = loop_start.elapsed() - render_time;
                            total_output_ms += output_time.as_secs_f64() * 1000.0;

                            output_result
                        }
                        Err(RenderError::OutputNotFound { .. }) => {
                            // Output was deleted - exit loop gracefully
                            log::info!(
                                "Output loop {output_id} stopping: output no longer exists in project"
                            );
                            break;
                        }
                        Err(e) => Err(e.to_string()),
                    }
                }
                OutputType::Sacn {
                    universe,
                    ip_address,
                    ..
                } => {
                    match Self::render_and_emit_dmx(output_id, system_t, frame, &app) {
                        Ok(dmx_vec) => {
                            let render_time = loop_start.elapsed();
                            total_render_ms += render_time.as_secs_f64() * 1000.0;

                            // Output via sACN
                            let sacn = sacn_state.lock().await;
                            let output_result =
                                sacn.output_sacn_internal(*universe, ip_address, &dmx_vec);
                            drop(sacn);

                            let output_time = loop_start.elapsed() - render_time;
                            total_output_ms += output_time.as_secs_f64() * 1000.0;

                            output_result
                        }
                        Err(RenderError::OutputNotFound { .. }) => {
                            // Output was deleted - exit loop gracefully
                            log::info!(
                                "Output loop {output_id} stopping: output no longer exists in project"
                            );
                            break;
                        }
                        Err(e) => Err(e.to_string()),
                    }
                }
                OutputType::Wled { ip_address, .. } => {
                    // Render WLED
                    match render_wled(output_id, system_t, frame) {
                        Ok(wled_data) => {
                            // Emit render event to frontend (encode to protobuf bytes)
                            let event = WledRenderEvent {
                                output_id: output_id.to_string(),
                                data: wled_data.encode_to_vec(),
                            };
                            if let Err(e) = app.emit("wled-render", event) {
                                log::error!("Failed to emit WLED render event: {e}");
                            }

                            let render_time = loop_start.elapsed();
                            total_render_ms += render_time.as_secs_f64() * 1000.0;

                            // Output via WLED
                            let wled = wled_state.lock().await;
                            let output_result =
                                wled.output_wled_internal(ip_address, &wled_data).await;
                            drop(wled);

                            let output_time = loop_start.elapsed() - render_time;
                            total_output_ms += output_time.as_secs_f64() * 1000.0;

                            output_result
                        }
                        Err(RenderError::OutputNotFound { .. }) => {
                            // Output was deleted - exit loop gracefully
                            log::info!(
                                "Output loop {output_id} stopping: output no longer exists in project"
                            );
                            break;
                        }
                        Err(e) => Err(e.to_string()),
                    }
                }
            };

            match result {
                Ok(()) => Self::clear_error(output_id, &app),
                Err(e) => Self::emit_error(output_id, e, &app),
            }

            frame = frame.wrapping_add(1);

            // Log timing stats every 5 seconds
            if frame % stats_interval == 0 && frame > 0 {
                let frames_f64 = f64::from(stats_interval);
                let avg_render = total_render_ms / frames_f64;
                let avg_output = total_output_ms / frames_f64;
                log::info!(
                    "Output {output_id} timing: late_frames={late_frames}, max_interval={max_interval_ms:.1}ms, avg_render={avg_render:.2}ms, avg_output={avg_output:.2}ms"
                );
                late_frames = 0;
                max_interval_ms = 0.0;
                total_render_ms = 0.0;
                total_output_ms = 0.0;
            }

            // Sleep to maintain target FPS
            let elapsed = loop_start.elapsed();
            if let Some(remaining) = frame_duration.checked_sub(elapsed) {
                tokio::time::sleep(remaining).await;
            }
        }

        Ok(())
    }
}
