use dmx_engine::project;
use dmx_engine::proto::output::Output as ProtoOutput;
use dmx_engine::proto::{DdpOutput, DisplayBuffer, PhysicalDisplayMapping};
use dmx_engine::render::render::{DisplayRenderData, RenderError, render_display_target};
use dmx_engine::render::shaders::render_display_shaders;
use prost::Message;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use crate::ddp::DdpState;
use crate::shader::ShaderState;

const DEFAULT_DISPLAY_FPS: u32 = 30;
/// FPS for emitting display render events to frontend for visualization.
/// Lower than output FPS to reduce IPC overhead (pixel buffers can be large).
const VISUALIZATION_FPS: u32 = 10;
/// Maximum dimension for visualization buffers sent to frontend.
/// Larger displays are downsampled to reduce IPC overhead.
const MAX_VISUALIZATION_SIZE: u32 = 20;

#[derive(Clone, Serialize)]
struct DisplayRenderEvent {
    display_id: String,
    data: Vec<u8>,
}

#[derive(Clone, Serialize)]
struct RenderErrorEvent {
    output_id: String,
    message: String,
}

struct DisplayLoopHandle {
    task: JoinHandle<()>,
    cancel_tx: tokio::sync::watch::Sender<bool>,
}

/// Configuration for a single DDP output in the display loop.
struct DdpOutputConfig {
    output_id: u64,
    ddp_output: DdpOutput,
    mappings: Vec<(u64, PhysicalDisplayMapping)>,
}

/// Configuration gathered from project for the display loop.
struct DisplayLoopConfig {
    display_ids: Vec<u64>,
    ddp_outputs: Vec<DdpOutputConfig>,
}

pub struct DisplayLoopManager {
    display_loop: Arc<Mutex<Option<DisplayLoopHandle>>>,
    app: AppHandle,
}

impl DisplayLoopManager {
    pub fn new(app: AppHandle) -> Self {
        DisplayLoopManager {
            display_loop: Arc::new(Mutex::new(None)),
            app,
        }
    }

    /// Starts display loop on app load if displays exist.
    pub fn start_on_load(manager: Arc<Mutex<Self>>, ddp_state: Arc<Mutex<DdpState>>) {
        tauri::async_runtime::spawn(async move {
            let manager = manager.lock().await;
            if let Err(e) = manager.rebuild_display_loop(ddp_state).await {
                log::error!("Failed to start display loop on startup: {e}");
            }
        });
    }

    /// Rebuilds the display loop based on current project state.
    /// Starts the loop if displays exist, stops it otherwise.
    pub async fn rebuild_display_loop(
        &self,
        ddp_state: Arc<Mutex<DdpState>>,
    ) -> Result<(), String> {
        // Check if any enabled displays exist with mappings in the current patch
        let has_displays: bool = project::with_project(|project| {
            Ok(project.displays.values().any(|display| {
                display.enabled
                    && display
                        .mappings
                        .iter()
                        .any(|mapping| mapping.patch == project.active_patch)
            }))
        })
        .map_err(|e| format!("Failed to check displays: {e}"))?;

        if has_displays {
            self.start_display_loop(ddp_state).await
        } else {
            self.stop_display_loop().await
        }
    }

    /// Starts the unified display loop.
    /// This loop renders all displays in lock-step and outputs to all DDP devices.
    async fn start_display_loop(&self, ddp_state: Arc<Mutex<DdpState>>) -> Result<(), String> {
        // Stop existing display loop if running
        self.stop_display_loop().await?;

        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
        let app_clone = self.app.clone();

        let task = tokio::spawn(async move {
            if let Err(e) = Self::run_display_loop(ddp_state, app_clone, cancel_rx).await {
                log::error!("Display loop failed: {e}");
            }
        });

        let handle = DisplayLoopHandle { task, cancel_tx };

        let mut display_loop = self.display_loop.lock().await;
        *display_loop = Some(handle);

        log::info!("Started unified display loop");
        Ok(())
    }

    async fn stop_display_loop(&self) -> Result<(), String> {
        let mut display_loop = self.display_loop.lock().await;

        if let Some(handle) = display_loop.take() {
            // Signal cancellation
            let _ = handle.cancel_tx.send(true);

            // Wait for task to finish (with timeout)
            if (tokio::time::timeout(Duration::from_millis(500), handle.task).await).is_err() {
                log::warn!("Display loop did not stop within timeout");
            }
            log::info!("Stopped display loop");
        }

        Ok(())
    }

    /// Unified display loop that renders all displays and outputs to all DDP devices.
    async fn run_display_loop(
        ddp_state: Arc<Mutex<DdpState>>,
        app: AppHandle,
        cancel_rx: tokio::sync::watch::Receiver<bool>,
    ) -> Result<(), String> {
        let frame_duration = Duration::from_millis(1000 / u64::from(DEFAULT_DISPLAY_FPS));
        let mut frame = 0u32;

        log::info!(
            "Starting unified display loop at {DEFAULT_DISPLAY_FPS} FPS (visualization at {VISUALIZATION_FPS} FPS)"
        );

        loop {
            // Check for cancellation
            if *cancel_rx.borrow() {
                log::info!("Display loop cancelled");
                break;
            }

            let loop_start = Instant::now();

            #[allow(clippy::cast_possible_truncation)]
            let system_t = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64;

            // Get all display IDs and DDP output configs from project
            let config: Result<DisplayLoopConfig, String> = project::with_project(|project| {
                let patch = project
                    .patches
                    .get(&project.active_patch)
                    .ok_or_else(|| "Active patch not found".to_string())?;

                // Only include enabled displays that have mappings in the current patch
                let display_ids: Vec<u64> = project
                    .displays
                    .iter()
                    .filter(|(_, display)| {
                        display.enabled
                            && display
                                .mappings
                                .iter()
                                .any(|mapping| mapping.patch == project.active_patch)
                    })
                    .map(|(id, _)| *id)
                    .collect();

                // Collect all enabled DDP outputs with their mappings
                let ddp_outputs: Vec<DdpOutputConfig> = patch
                    .outputs
                    .iter()
                    .filter_map(|(output_id, output)| {
                        if !output.enabled {
                            return None;
                        }
                        match &output.output {
                            Some(ProtoOutput::DdpOutput(ddp)) => {
                                // Collect mappings for this output (only from enabled displays in current patch)
                                let mappings: Vec<(u64, PhysicalDisplayMapping)> = project
                                    .displays
                                    .iter()
                                    .filter(|(_, display)| display.enabled)
                                    .flat_map(|(display_id, display)| {
                                        display
                                            .mappings
                                            .iter()
                                            .filter(|mapping| {
                                                mapping.patch == project.active_patch
                                                    && mapping.output == *output_id
                                            })
                                            .map(move |mapping| (*display_id, *mapping))
                                    })
                                    .collect();

                                Some(DdpOutputConfig {
                                    output_id: *output_id,
                                    ddp_output: ddp.clone(),
                                    mappings,
                                })
                            }
                            _ => None,
                        }
                    })
                    .collect();

                Ok(DisplayLoopConfig {
                    display_ids,
                    ddp_outputs,
                })
            });

            let config = match config {
                Ok(c) => c,
                Err(e) => {
                    log::error!("Failed to get display config: {e}");
                    frame = frame.wrapping_add(1);
                    tokio::time::sleep(frame_duration).await;
                    continue;
                }
            };

            // If no displays exist anymore, exit the loop
            if config.display_ids.is_empty() {
                log::info!("No displays configured, stopping display loop");
                break;
            }

            // GPU shader state is optional: if it failed to initialize we fall
            // back to the CPU renderer for every display.
            let shader_state = app.try_state::<Arc<StdMutex<ShaderState>>>();

            // Render all displays
            let mut buffers: HashMap<u64, DisplayBuffer> = HashMap::new();
            for display_id in &config.display_ids {
                let data = match render_display_target(*display_id, system_t, frame) {
                    Ok(data) => data,
                    Err(RenderError::OutputNotFound { .. }) => continue, // deleted
                    Err(e) => {
                        log::error!("Failed to render display {display_id}: {e}");
                        continue;
                    }
                };

                let buffer = render_display_buffer(
                    *display_id,
                    &data,
                    system_t,
                    shader_state.as_deref(),
                );

                let event = DisplayRenderEvent {
                    display_id: display_id.to_string(),
                    data: buffer.downsample(MAX_VISUALIZATION_SIZE).encode_to_vec(),
                };
                if let Err(e) = app.emit("display-render", event) {
                    log::error!("Failed to emit display render event: {e}");
                }
                buffers.insert(*display_id, buffer);
            }

            // Output to all DDP devices
            for ddp_config in &config.ddp_outputs {
                let mut ddp = ddp_state.lock().await;
                if let Err(e) = ddp.output_ddp_internal(
                    &buffers,
                    &ddp_config.ddp_output,
                    ddp_config.output_id,
                    &ddp_config.mappings,
                ) {
                    Self::emit_error(ddp_config.output_id, e, &app);
                } else {
                    Self::clear_error(ddp_config.output_id, &app);
                }
            }

            frame = frame.wrapping_add(1);

            // Sleep to maintain target FPS
            let elapsed = loop_start.elapsed();
            if let Some(remaining) = frame_duration.checked_sub(elapsed) {
                const SPIN_BUDGET: Duration = Duration::from_millis(3);
                tokio::task::block_in_place(|| {
                    let sleep_duration = remaining.saturating_sub(SPIN_BUDGET);
                    std::thread::sleep(sleep_duration);
                    while loop_start.elapsed() < frame_duration {
                        std::hint::spin_loop();
                    }
                });
            }
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
        if let Err(e) = app.emit("render-error-clear", output_id.to_string()) {
            log::error!("Failed to emit render error clear event: {e}");
        }
    }
}

/// Render a single display to a `DisplayBuffer`. Uses the GPU shader pipeline
/// when the display has a visualizer tree and GPU state is available; otherwise
/// falls back to the CPU renderer.
fn render_display_buffer(
    display_id: u64,
    data: &DisplayRenderData,
    system_t: u64,
    shader_state: Option<&Arc<StdMutex<ShaderState>>>,
) -> DisplayBuffer {
    if let (Some(tree), Some(shader_state)) = (&data.uniforms.visualizer_tree, shader_state) {
        // Readback blocks on GPU work; keep it off the async executor threads.
        let rgba = tokio::task::block_in_place(|| {
            let mut state = shader_state.lock().expect("shader state lock poisoned");
            state.render_and_readback(tree, &data.shader_uniforms, data.width, data.height)
        });
        rgba8_to_display_buffer(display_id, data.width, data.height, &rgba)
    } else {
        render_display_shaders(display_id, data.width, data.height, system_t, &data.uniforms)
    }
}

/// Convert tightly-packed RGBA8 bytes (4 bytes/pixel, row-major) into a
/// `DisplayBuffer` (f32 RGB, alpha dropped).
fn rgba8_to_display_buffer(id: u64, width: u32, height: u32, rgba: &[u8]) -> DisplayBuffer {
    let mut buffer = DisplayBuffer::new(id, width, height);
    for (i, px) in rgba.chunks_exact(4).enumerate() {
        let base = i * 3;
        if base + 2 >= buffer.pixels.len() {
            break;
        }
        buffer.pixels[base] = f32::from(px[0]) / 255.0;
        buffer.pixels[base + 1] = f32::from(px[1]) / 255.0;
        buffer.pixels[base + 2] = f32::from(px[2]) / 255.0;
    }
    buffer
}
