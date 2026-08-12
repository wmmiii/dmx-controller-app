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
}
