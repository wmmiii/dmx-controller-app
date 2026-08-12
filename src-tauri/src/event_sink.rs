use dmx_engine::audio::AudioAnalysis;
use dmx_engine::project::{self, UndoState};
use dmx_engine::proto::{DisplayBuffer, WledRenderTarget};
use dmx_runtime::events::EventSink;
use prost::Message;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

// =============================================================================
// Flow control for project updates to frontend
// =============================================================================
//
// This prevents overwhelming the frontend with rapid updates (e.g., from MIDI).
//
// Protocol:
// 1. Frontend signals "ready" when it can accept an update
// 2. Backend sets "dirty" when the project changes via emit_project_update
// 3. When both flags are set, we send an update and clear both
// 4. Frontend signals "ready" again after processing

static PROJECT_DIRTY: AtomicBool = AtomicBool::new(false);
static FRONTEND_READY: AtomicBool = AtomicBool::new(true); // Start ready for initial update

/// Maximum size for visualization buffers sent to frontend.
/// Larger displays are downsampled to reduce IPC overhead.
const MAX_VISUALIZATION_SIZE: u32 = 20;

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
struct DisplayRenderEvent {
    display_id: String,
    data: Vec<u8>,
}

#[derive(Clone, Serialize)]
struct RenderErrorEvent {
    output_id: String,
    message: String,
}

#[derive(Clone, Serialize)]
struct MidiMessage {
    device_name: String,
    data: Vec<u8>,
}

#[derive(Clone, Serialize)]
struct MidiConnectionStatusEvent {
    controller_name: String,
    connected: bool,
}

#[derive(Clone, Serialize)]
struct AudioInputDevice {
    name: String,
}

#[derive(Clone, Serialize)]
struct AudioDeviceListChangedEvent {
    devices: Vec<AudioInputDevice>,
}

/// Payload for the project-updated event.
#[derive(Clone, Serialize)]
struct ProjectUpdatedPayload {
    project_binary: Vec<u8>,
}

/// Payload for the undo-state-changed event
#[derive(Clone, Serialize)]
pub struct UndoStatePayload {
    can_undo: bool,
    can_redo: bool,
    undo_description: Option<String>,
    redo_description: Option<String>,
}

impl From<UndoState> for UndoStatePayload {
    fn from(state: UndoState) -> Self {
        UndoStatePayload {
            can_undo: state.can_undo,
            can_redo: state.can_redo,
            undo_description: state.undo_description,
            redo_description: state.redo_description,
        }
    }
}

/// Emits a project-updated event (low-level, called when frontend is ready).
fn emit_project_update_impl(app: &AppHandle) {
    if let Ok(project_binary) = project::get() {
        let _ = app.emit("project-updated", ProjectUpdatedPayload { project_binary });
    }
}

/// Emits undo-state-changed event. Called separately from project updates
/// since undo state changes are infrequent and should be immediate.
pub fn emit_undo_state(app: &AppHandle) {
    if let Ok(undo_state) = project::get_undo_state() {
        let _ = app.emit("undo-state-changed", UndoStatePayload::from(undo_state));
    }
}

/// Marks the project as dirty and emits update if frontend is ready.
/// This is the single entry point for all project update emissions.
pub fn emit_project_update(app: &AppHandle) {
    PROJECT_DIRTY.store(true, Ordering::Release);

    // Check if frontend is ready (and clear the flag atomically if so)
    if FRONTEND_READY.swap(false, Ordering::AcqRel) {
        PROJECT_DIRTY.store(false, Ordering::Release);
        emit_project_update_impl(app);
    }
    // Otherwise, update will be sent when frontend signals ready
}

/// Called by the frontend when it's ready for the next project update.
pub fn frontend_ready(app: &AppHandle) {
    FRONTEND_READY.store(true, Ordering::Release);

    // Check if project is dirty (and clear the flag atomically if so)
    if PROJECT_DIRTY.swap(false, Ordering::AcqRel) {
        FRONTEND_READY.store(false, Ordering::Release);
        emit_project_update_impl(app);
    }
    // Otherwise, update will be sent when project changes
}

pub struct TauriEventSink {
    app: AppHandle,
}

impl TauriEventSink {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl EventSink for TauriEventSink {
    fn dmx_render(&self, output_id: u64, data: &[u8]) {
        let event = DmxRenderEvent {
            output_id: output_id.to_string(),
            data: data.to_vec(),
        };
        if let Err(e) = self.app.emit("dmx-render", event) {
            log::error!("Failed to emit DMX render event: {e}");
        }
    }

    fn wled_render(&self, output_id: u64, target: &WledRenderTarget) {
        let event = WledRenderEvent {
            output_id: output_id.to_string(),
            data: target.encode_to_vec(),
        };
        if let Err(e) = self.app.emit("wled-render", event) {
            log::error!("Failed to emit WLED render event: {e}");
        }
    }

    fn display_render(&self, display_id: u64, buffer: &DisplayBuffer) {
        let event = DisplayRenderEvent {
            display_id: display_id.to_string(),
            data: buffer.downsample(MAX_VISUALIZATION_SIZE).encode_to_vec(),
        };
        if let Err(e) = self.app.emit("display-render", event) {
            log::error!("Failed to emit display render event: {e}");
        }
    }

    fn render_error(&self, output_id: u64, message: &str) {
        let event = RenderErrorEvent {
            output_id: output_id.to_string(),
            message: message.to_string(),
        };
        if let Err(e) = self.app.emit("render-error", event) {
            log::error!("Failed to emit render error event: {e}");
        }
    }

    fn render_error_clear(&self, output_id: u64) {
        if let Err(e) = self.app.emit("render-error-clear", output_id.to_string()) {
            log::error!("Failed to emit render error clear event: {e}");
        }
    }

    fn project_updated(&self) {
        emit_project_update(&self.app);
    }

    fn beat_sampled(&self) {
        if let Err(e) = self.app.emit("beat-sampling-state", true) {
            log::error!("Failed to emit beat sampling state event: {e}");
        }
    }

    fn midi_message(&self, device_name: &str, data: &[u8]) {
        let event = MidiMessage {
            device_name: device_name.to_string(),
            data: data.to_vec(),
        };
        if let Err(e) = self.app.emit("midi-message", &event) {
            log::error!("Failed to emit MIDI event: {e}");
        }
    }

    fn midi_connection_status(&self, controller_name: &str, connected: bool) {
        let event = MidiConnectionStatusEvent {
            controller_name: controller_name.to_string(),
            connected,
        };
        if let Err(e) = self.app.emit("midi-connection-status", &event) {
            log::error!("Failed to emit midi-connection-status event: {e}");
        }
    }

    fn audio_devices_changed(&self, device_names: &[String]) {
        let event = AudioDeviceListChangedEvent {
            devices: device_names
                .iter()
                .map(|name| AudioInputDevice { name: name.clone() })
                .collect(),
        };
        let _ = self.app.emit("audio-device-list-changed", &event);
    }

    fn audio_beat_active(&self, active: bool) {
        let _ = self.app.emit("audio-beat-active", active);
    }

    fn audio_analysis(&self, analysis: &AudioAnalysis) {
        let _ = self.app.emit("audio-input-analysis", analysis);
    }
}
