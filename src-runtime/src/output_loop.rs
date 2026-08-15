use dmx_engine::project;
use dmx_engine::proto::output::Output as ProtoOutput;
use dmx_engine::render::render::{RenderError, render_dmx, render_wled};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use crate::events::EventSink;
use crate::util::now_ms;
use crate::sacn::SacnState;
use crate::serial::SerialState;
use crate::wled::WledState;

// Default FPS for each output type when not specified
const DEFAULT_SERIAL_FPS: u32 = 44;
const DEFAULT_SACN_FPS: u32 = 44;
const DEFAULT_WLED_FPS: u32 = 42;

/// Well past any real fixture's refresh rate. Without a ceiling a large enough
/// configured rate rounds the frame duration to zero, which turns the loop into
/// a spin that pegs a core.
const MAX_FPS: u32 = 1000;

fn resolve_fps(configured: u32, default: u32) -> u32 {
    if configured > 0 {
        configured.min(MAX_FPS)
    } else {
        default
    }
}

/// Nanoseconds, not milliseconds: `1000 / 44` truncates to 22ms, which paces
/// the loop at 45.5 fps rather than the 44 that was asked for.
fn frame_duration(fps: u32) -> Duration {
    Duration::from_nanos(1_000_000_000 / u64::from(fps))
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
    loops: Mutex<HashMap<u64, OutputLoopHandle>>,
    events: Arc<dyn EventSink>,
}

impl OutputLoopManager {
    pub fn new(events: Arc<dyn EventSink>) -> Self {
        OutputLoopManager {
            loops: Mutex::new(HashMap::new()),
            events,
        }
    }

    /// Starts output loops for the currently loaded project.
    /// Should be called after app startup to begin DMX output.
    pub fn start_on_load(
        manager: Arc<Self>,
        serial_state: Arc<SerialState>,
        sacn_state: Arc<SacnState>,
        wled_state: Arc<WledState>,
    ) {
        tokio::spawn(async move {
            if let Err(e) = manager
                .rebuild_all_loops(serial_state, sacn_state, wled_state)
                .await
            {
                log::error!("Failed to start output loops on startup: {e}");
            }
        });
    }

    async fn start_loop(
        &self,
        output_id: u64,
        output_type: OutputType,
        serial_state: Arc<SerialState>,
        sacn_state: Arc<SacnState>,
        wled_state: Arc<WledState>,
        loops: &mut HashMap<u64, OutputLoopHandle>,
    ) -> Result<(), String> {
        // Stop existing loop if running
        stop_loop(output_id, loops).await;

        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
        let output_type_clone = output_type.clone();
        let events = Arc::clone(&self.events);

        // The task does NOT remove itself from the map on exit.
        // stop_loop removes the handle before signalling cancel, so the task
        // never needs the loops lock to exit — eliminating a deadlock where
        // stop_loop held the lock while awaiting the task, which in turn
        // needed the lock before it could complete.
        let task = tokio::spawn(async move {
            if let Err(e) = Self::run_output_loop(
                output_id,
                output_type_clone,
                serial_state,
                sacn_state,
                wled_state,
                events,
                cancel_rx,
            )
            .await
            {
                log::error!("Output loop {output_id} failed: {e}");
            }
        });

        let handle = OutputLoopHandle {
            task,
            cancel_tx,
            output_type,
        };

        loops.insert(output_id, handle);

        Ok(())
    }

    pub async fn stop_all(&self) {
        let mut loops = self.loops.lock().await;

        let output_ids: Vec<u64> = loops.keys().copied().collect();
        for output_id in output_ids {
            stop_loop(output_id, &mut loops).await;
        }
    }

    pub async fn rebuild_all_loops(
        &self,
        serial_state: Arc<SerialState>,
        sacn_state: Arc<SacnState>,
        wled_state: Arc<WledState>,
    ) -> Result<(), String> {
        // Read the project before taking `loops`, so the two locks never nest. (avoid holding lock during async I/O)
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
                        fps: resolve_fps(output.fps, DEFAULT_SERIAL_FPS),
                    },
                    Some(ProtoOutput::SacnDmxOutput(sacn)) => OutputType::Sacn {
                        universe: sacn.universe as u16,
                        ip_address: sacn.ip_address.clone(),
                        fps: resolve_fps(output.fps, DEFAULT_SACN_FPS),
                    },
                    Some(ProtoOutput::WledOutput(wled)) => OutputType::Wled {
                        ip_address: wled.ip_address.clone(),
                        fps: resolve_fps(output.fps, DEFAULT_WLED_FPS),
                    },
                    // DDP outputs are handled by DisplayLoopManager; skip None too
                    Some(ProtoOutput::DdpOutput(_)) | None => continue,
                };
                outputs.insert(*output_id, output_type);
            }
            Ok(outputs)
        })?;

        // Held across the whole reconciliation: releasing it between stopping an
        // output's old loop and inserting its new handle would let two
        // overlapping rebuilds each spawn a loop for that output, and whichever
        // inserted first would be overwritten and left running uncancellable.
        let mut loops = self.loops.lock().await;

        let current_loops = loops
            .iter()
            .map(|(id, handle)| (*id, handle.output_type.clone()))
            .collect::<HashMap<_, _>>();

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
            let is_serial = matches!(
                current_loops.get(&output_id),
                Some(OutputType::Serial { .. })
            );
            let will_restart = to_start.iter().any(|(id, _)| *id == output_id);
            stop_loop(output_id, &mut loops).await;
            // Close the serial port when the output is disabled or deleted. Skip
            // this when the loop is being immediately restarted (e.g. FPS change)
            // so we don't briefly drop and reopen the same port.
            if is_serial && !will_restart {
                let _ = serial_state.try_close_port(&output_id.to_string());
            }
        }

        // Start new loops
        for (output_id, output_type) in to_start {
            self.start_loop(
                output_id,
                output_type,
                serial_state.clone(),
                sacn_state.clone(),
                wled_state.clone(),
                &mut loops,
            )
            .await?;
        }

        Ok(())
    }

    fn render_and_emit_dmx(
        output_id: u64,
        system_t: u64,
        frame: u32,
        events: &dyn EventSink,
    ) -> Result<Vec<u8>, RenderError> {
        let dmx_data = render_dmx(output_id, system_t, frame)?;
        let dmx_vec = dmx_data.to_vec();

        events.dmx_render(output_id, &dmx_vec);

        Ok(dmx_vec)
    }

    async fn run_output_loop(
        output_id: u64,
        output_type: OutputType,
        serial_state: Arc<SerialState>,
        sacn_state: Arc<SacnState>,
        wled_state: Arc<WledState>,
        events: Arc<dyn EventSink>,
        cancel_rx: tokio::sync::watch::Receiver<bool>,
    ) -> Result<(), String> {
        let target_fps = match &output_type {
            OutputType::Serial { fps }
            | OutputType::Sacn { fps, .. }
            | OutputType::Wled { fps, .. } => *fps,
        };

        let frame_duration = frame_duration(target_fps);
        let mut frame = 0u32;

        log::info!("Starting output loop {output_id} ({output_type:?}) at {target_fps} FPS");

        loop {
            // Check for cancellation
            if *cancel_rx.borrow() {
                log::info!("Output loop {output_id} cancelled");
                break;
            }

            let loop_start = Instant::now();

            // Render the frame
            let system_t = now_ms();

            let result = match &output_type {
                OutputType::Serial { .. } => {
                    match Self::render_and_emit_dmx(output_id, system_t, frame, events.as_ref()) {
                        Ok(dmx_vec) => {
                            serial_state.output_dmx(&output_id.to_string(), &dmx_vec)
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
                    match Self::render_and_emit_dmx(output_id, system_t, frame, events.as_ref()) {
                        Ok(dmx_vec) => {
                            sacn_state.output_sacn(*universe, ip_address, &dmx_vec)
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
                            events.wled_render(output_id, &wled_data);

                            wled_state.output_wled(ip_address, &wled_data).await
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
                Ok(()) => events.render_error_clear(output_id),
                Err(e) => events.render_error(output_id, &e),
            }

            frame = frame.wrapping_add(1);

            // Sleep to maintain target FPS.
            // tokio::time::sleep can be delayed 100ms+ on Windows when the tokio scheduler
            // is busy with Tauri/WebView work. block_in_place runs the sleep on an OS thread,
            // bypassing the tokio scheduler entirely for precise frame timing.
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
}

async fn stop_loop(output_id: u64, loops: &mut HashMap<u64, OutputLoopHandle>) {
    let Some(handle) = loops.remove(&output_id) else {
        return;
    };

    let _ = handle.cancel_tx.send(true);

    if (tokio::time::timeout(Duration::from_millis(500), handle.task).await).is_err() {
        log::warn!("Output loop {output_id} did not stop within timeout");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn effective_fps(configured: u32, default: u32) -> f64 {
        1.0 / frame_duration(resolve_fps(configured, default)).as_secs_f64()
    }

    #[test]
    fn paces_within_a_frame_of_the_configured_rate() {
        for fps in [1, 24, 25, 30, 42, 44, 50, 60, 120, MAX_FPS] {
            let effective = effective_fps(fps, DEFAULT_SERIAL_FPS);
            assert!(
                (effective - f64::from(fps)).abs() < 0.001,
                "{fps} fps paced at {effective}"
            );
        }
    }

    #[test]
    fn falls_back_to_the_default_when_unset() {
        assert_eq!(resolve_fps(0, DEFAULT_WLED_FPS), DEFAULT_WLED_FPS);
    }

    #[test]
    fn caps_the_rate_so_the_frame_duration_stays_positive() {
        assert_eq!(resolve_fps(u32::MAX, DEFAULT_SERIAL_FPS), MAX_FPS);
        assert!(frame_duration(resolve_fps(u32::MAX, DEFAULT_SERIAL_FPS)) > Duration::ZERO);
    }
}
