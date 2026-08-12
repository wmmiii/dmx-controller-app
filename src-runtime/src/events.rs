use dmx_engine::proto::{DisplayBuffer, WledRenderTarget};

pub trait EventSink: Send + Sync + 'static {
    fn dmx_render(&self, _output_id: u64, _data: &[u8]) {}
    fn wled_render(&self, _output_id: u64, _target: &WledRenderTarget) {}
    fn display_render(&self, _display_id: u64, _buffer: &DisplayBuffer) {}
    fn render_error(&self, _output_id: u64, _message: &str) {}
    fn render_error_clear(&self, _output_id: u64) {}
}

pub struct NullEventSink;

impl EventSink for NullEventSink {}
