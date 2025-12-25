use dmx_engine::project::PROJECT_REF;
use dmx_engine::proto::{output::output::Output as ProtoOutput, Project};
use dmx_engine::render::scene;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex as TokioMutex;
use tokio::task::JoinHandle;
use serde::Serialize;
use prost::Message;

use crate::sacn::SacnState;
use crate::serial::SerialState;
use crate::wled::WledState;

// FPS constants for each output type
const SERIAL_FPS: u32 = 30;
const SACN_FPS: u32 = 100;
const WLED_FPS: u32 = 30;

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

#[derive(Debug, Clone, PartialEq)]
pub enum OutputType {
    Serial,
    Sacn { universe: u16, ip_address: String },
    Wled { ip_address: String },
}

struct OutputLoopHandle {
    task: JoinHandle<()>,
    cancel_tx: tokio::sync::watch::Sender<bool>,
    output_type: OutputType,
}

pub struct OutputLoopManager {
    loops: Arc<TokioMutex<HashMap<u64, OutputLoopHandle>>>,
    app: AppHandle,
}

impl OutputLoopManager {
    pub fn new(app: AppHandle) -> Self {
        OutputLoopManager {
            loops: Arc::new(TokioMutex::new(HashMap::new())),
            app,
        }
    }

    pub async fn start_loop(
        &self,
        output_id: u64,
        output_type: OutputType,
        serial_state: Arc<TokioMutex<SerialState>>,
        sacn_state: Arc<TokioMutex<SacnState>>,
        wled_state: Arc<TokioMutex<WledState>>,
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
                log::error!("Output loop {} failed: {}", output_id, e);
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
            match tokio::time::timeout(Duration::from_millis(500), handle.task).await {
                Ok(_) => Ok(()),
                Err(_) => {
                    log::warn!("Output loop {} did not stop within timeout", output_id);
                    Ok(())
                }
            }
        } else {
            Ok(()) // Already stopped
        }
    }

    pub async fn stop_all_loops(&self) -> Result<(), String> {
        let output_ids: Vec<u64> = {
            let loops = self.loops.lock().await;
            loops.keys().copied().collect()
        };

        for output_id in output_ids {
            self.stop_loop(output_id).await?;
        }

        Ok(())
    }

    pub async fn rebuild_all_loops(
        &self,
        serial_state: Arc<TokioMutex<SerialState>>,
        sacn_state: Arc<TokioMutex<SacnState>>,
        wled_state: Arc<TokioMutex<WledState>>,
    ) -> Result<(), String> {
        // Read the current project to determine what outputs should be running
        let project = PROJECT_REF
            .lock()
            .map_err(|e| format!("Failed to lock project: {}", e))?
            .clone();

        let active_patch_id = project.active_patch;
        let active_patch = project
            .patches
            .get(&active_patch_id)
            .ok_or_else(|| format!("Active patch {} not found", active_patch_id))?;

        // Build a map of desired outputs
        let mut desired_outputs: HashMap<u64, OutputType> = HashMap::new();
        for (output_id, output) in &active_patch.outputs {
            let output_type = match &output.output {
                Some(ProtoOutput::SerialDmxOutput(_)) => OutputType::Serial,
                Some(ProtoOutput::SacnDmxOutput(sacn)) => OutputType::Sacn {
                    universe: sacn.universe as u16,
                    ip_address: sacn.ip_address.clone(),
                },
                Some(ProtoOutput::WledOutput(wled)) => OutputType::Wled {
                    ip_address: wled.ip_address.clone(),
                },
                None => continue, // Skip outputs without a type
            };
            desired_outputs.insert(*output_id, output_type);
        }

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
            log::info!("Stopping output loop {} (removed or changed)", output_id);
            self.stop_loop(output_id).await?;
        }

        // Start new loops
        for (output_id, output_type) in to_start {
            log::info!("Starting output loop {} ({:?})", output_id, output_type);
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

    async fn render_and_emit_dmx(
        output_id: u64,
        system_t: u64,
        frame: u32,
        app: &AppHandle,
    ) -> Result<Vec<u8>, String> {
        match scene::render_scene_dmx(output_id, system_t, frame) {
            Ok(dmx_data) => {
                let dmx_vec = dmx_data.to_vec();

                // Emit render event to frontend
                let event = DmxRenderEvent {
                    output_id: output_id.to_string(),
                    data: dmx_vec.clone(),
                };
                if let Err(e) = app.emit("dmx-render", event) {
                    log::error!("Failed to emit DMX render event: {}", e);
                }

                Ok(dmx_vec)
            }
            Err(e) => {
                log::error!("Failed to render DMX for output {}: {}", output_id, e);
                Err(e)
            }
        }
    }

    async fn run_output_loop(
        output_id: u64,
        output_type: OutputType,
        serial_state: Arc<TokioMutex<SerialState>>,
        sacn_state: Arc<TokioMutex<SacnState>>,
        wled_state: Arc<TokioMutex<WledState>>,
        app: AppHandle,
        mut cancel_rx: tokio::sync::watch::Receiver<bool>,
    ) -> Result<(), String> {
        let target_fps = match &output_type {
            OutputType::Serial => SERIAL_FPS,
            OutputType::Sacn { .. } => SACN_FPS,
            OutputType::Wled { .. } => WLED_FPS,
        };

        let frame_duration = Duration::from_millis(1000 / target_fps as u64);
        let mut frame = 0u32;

        log::info!("Starting output loop {} ({:?}) at {} FPS", output_id, output_type, target_fps);

        loop {
            // Check for cancellation
            if *cancel_rx.borrow() {
                log::info!("Output loop {} cancelled", output_id);
                break;
            }

            let loop_start = Instant::now();

            // Render the frame
            let system_t = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64;

            match &output_type {
                OutputType::Serial => {
                    if let Ok(dmx_vec) = Self::render_and_emit_dmx(output_id, system_t, frame, &app).await {
                        // Output via serial
                        let serial = serial_state.lock().await;
                        if let Err(e) = serial.output_dmx_internal(&output_id.to_string(), &dmx_vec) {
                            log::error!("Failed to output serial DMX: {}", e);
                        }
                    }
                }
                OutputType::Sacn { universe, ip_address } => {
                    if let Ok(dmx_vec) = Self::render_and_emit_dmx(output_id, system_t, frame, &app).await {
                        // Output via sACN
                        let sacn = sacn_state.lock().await;
                        if let Err(e) = sacn.output_sacn_internal(*universe, ip_address, &dmx_vec) {
                            log::error!("Failed to output sACN DMX: {}", e);
                        }
                    }
                }
                OutputType::Wled { ip_address } => {
                    // Render WLED
                    match scene::render_scene_wled(output_id, system_t, frame) {
                        Ok(wled_data) => {
                            // Output via WLED
                            let wled = wled_state.lock().await;
                            if let Err(e) = wled.output_wled_internal(ip_address, &wled_data) {
                                log::error!("Failed to output WLED: {}", e);
                            }
                            drop(wled);

                            // Emit render event to frontend (encode to protobuf bytes)
                            let event = WledRenderEvent {
                                output_id: output_id.to_string(),
                                data: wled_data.encode_to_vec(),
                            };
                            if let Err(e) = app.emit("wled-render", event) {
                                log::error!("Failed to emit WLED render event: {}", e);
                            }
                        }
                        Err(e) => {
                            log::error!("Failed to render WLED for output {}: {}", output_id, e);
                        }
                    }
                }
            }

            frame = frame.wrapping_add(1);

            // Sleep to maintain target FPS
            let elapsed = loop_start.elapsed();
            if elapsed < frame_duration {
                tokio::time::sleep(frame_duration - elapsed).await;
            }
        }

        Ok(())
    }
}

#[tauri::command]
pub async fn start_output_loop(
    manager: State<'_, Arc<TokioMutex<OutputLoopManager>>>,
    serial_state: State<'_, Arc<TokioMutex<SerialState>>>,
    sacn_state: State<'_, Arc<TokioMutex<SacnState>>>,
    wled_state: State<'_, Arc<TokioMutex<WledState>>>,
    output_id: String,
    output_type: String,
    universe: Option<u16>,
    ip_address: Option<String>,
) -> Result<(), String> {
    let output_id_u64 = output_id
        .parse::<u64>()
        .map_err(|e| format!("Invalid output_id: {}", e))?;

    let output_type = match output_type.as_str() {
        "serial" => OutputType::Serial,
        "sacn" => OutputType::Sacn {
            universe: universe.ok_or("universe required for sACN")?,
            ip_address: ip_address.ok_or("ip_address required for sACN")?,
        },
        "wled" => OutputType::Wled {
            ip_address: ip_address.ok_or("ip_address required for WLED")?,
        },
        _ => return Err(format!("Unknown output type: {}", output_type)),
    };

    let manager = manager.lock().await;
    manager
        .start_loop(
            output_id_u64,
            output_type,
            serial_state.inner().clone(),
            sacn_state.inner().clone(),
            wled_state.inner().clone(),
        )
        .await
}

#[tauri::command]
pub async fn stop_output_loop(
    manager: State<'_, Arc<TokioMutex<OutputLoopManager>>>,
    output_id: String,
) -> Result<(), String> {
    let output_id_u64 = output_id
        .parse::<u64>()
        .map_err(|e| format!("Invalid output_id: {}", e))?;

    let manager = manager.lock().await;
    manager.stop_loop(output_id_u64).await
}

#[tauri::command]
pub async fn rebuild_output_loops(
    manager: State<'_, Arc<TokioMutex<OutputLoopManager>>>,
    serial_state: State<'_, Arc<TokioMutex<SerialState>>>,
    sacn_state: State<'_, Arc<TokioMutex<SacnState>>>,
    wled_state: State<'_, Arc<TokioMutex<WledState>>>,
) -> Result<(), String> {
    let manager = manager.lock().await;
    manager
        .rebuild_all_loops(
            serial_state.inner().clone(),
            sacn_state.inner().clone(),
            wled_state.inner().clone(),
        )
        .await
}
