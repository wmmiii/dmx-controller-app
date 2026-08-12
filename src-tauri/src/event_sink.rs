use dmx_engine::audio::AudioAnalysis;
use dmx_engine::proto::{DisplayBuffer, WledRenderTarget};
use dmx_runtime::events::EventSink;
use prost::Message;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

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

/// Mirrors `dmx_runtime::audio_input::AudioInputDevice`, which the frontend
/// also receives from `list_audio_inputs`.
#[derive(Clone, Serialize)]
struct AudioInputDevice {
    name: String,
}

#[derive(Clone, Serialize)]
struct AudioDeviceListChangedEvent {
    devices: Vec<AudioInputDevice>,
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

    /// Routed through the project module so it keeps the `PROJECT_DIRTY` /
    /// `FRONTEND_READY` handshake that throttles updates to the webview.
    fn project_updated(&self) {
        crate::project::emit_project_update(&self.app);
    }

    fn beat_sampling_state(&self, sampling: bool) {
        if let Err(e) = self.app.emit("beat-sampling-state", sampling) {
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
