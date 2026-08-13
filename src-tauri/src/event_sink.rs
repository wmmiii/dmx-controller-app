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

fn emit<S: Serialize + Clone>(app: &AppHandle, event: &str, payload: S) {
    if let Err(e) = app.emit(event, payload) {
        log::error!("Failed to emit {event}: {e}");
    }
}

/// Emits a project-updated event (low-level, called when frontend is ready).
fn emit_project_update_impl(app: &AppHandle) {
    if let Ok(project_binary) = project::get() {
        emit(app, "project-updated", ProjectUpdatedPayload { project_binary });
    }
}

/// Emits undo-state-changed event. Called separately from project updates
/// since undo state changes are infrequent and should be immediate.
fn emit_undo_state(app: &AppHandle) {
    if let Ok(undo_state) = project::get_undo_state() {
        emit(app, "undo-state-changed", UndoStatePayload::from(undo_state));
    }
}

/// Marks the project as dirty and emits update if frontend is ready.
/// This is the single entry point for all project update emissions.
fn emit_project_update(app: &AppHandle) {
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

    fn emit<S: Serialize + Clone>(&self, event: &str, payload: S) {
        emit(&self.app, event, payload);
    }
}

impl EventSink for TauriEventSink {
    fn dmx_render(&self, output_id: u64, data: &[u8]) {
        self.emit(
            "dmx-render",
            DmxRenderEvent {
                output_id: output_id.to_string(),
                data: data.to_vec(),
            },
        );
    }

    fn wled_render(&self, output_id: u64, target: &WledRenderTarget) {
        self.emit(
            "wled-render",
            WledRenderEvent {
                output_id: output_id.to_string(),
                data: target.encode_to_vec(),
            },
        );
    }

    fn display_render(&self, display_id: u64, buffer: &DisplayBuffer) {
        self.emit(
            "display-render",
            DisplayRenderEvent {
                display_id: display_id.to_string(),
                data: buffer.downsample(MAX_VISUALIZATION_SIZE).encode_to_vec(),
            },
        );
    }

    fn render_error(&self, output_id: u64, message: &str) {
        self.emit(
            "render-error",
            RenderErrorEvent {
                output_id: output_id.to_string(),
                message: message.to_string(),
            },
        );
    }

    fn render_error_clear(&self, output_id: u64) {
        self.emit("render-error-clear", output_id.to_string());
    }

    fn project_updated(&self) {
        emit_project_update(&self.app);
    }

    fn undo_state_changed(&self) {
        emit_undo_state(&self.app);
    }

    fn beat_sampled(&self) {
        self.emit("beat-sampling-state", true);
    }

    fn midi_message(&self, device_name: &str, data: &[u8]) {
        self.emit(
            "midi-message",
            MidiMessage {
                device_name: device_name.to_string(),
                data: data.to_vec(),
            },
        );
    }

    fn midi_connection_status(&self, controller_name: &str, connected: bool) {
        self.emit(
            "midi-connection-status",
            MidiConnectionStatusEvent {
                controller_name: controller_name.to_string(),
                connected,
            },
        );
    }

    fn audio_devices_changed(&self, device_names: &[String]) {
        self.emit(
            "audio-device-list-changed",
            AudioDeviceListChangedEvent {
                devices: device_names
                    .iter()
                    .map(|name| AudioInputDevice { name: name.clone() })
                    .collect(),
            },
        );
    }

    fn audio_beat_active(&self, active: bool) {
        self.emit("audio-beat-active", active);
    }

    fn audio_analysis(&self, analysis: &AudioAnalysis) {
        self.emit("audio-input-analysis", analysis);
    }
}
