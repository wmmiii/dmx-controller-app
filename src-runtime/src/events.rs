use dmx_engine::audio::AudioAnalysis;
use dmx_engine::proto::{DisplayBuffer, WledRenderTarget};

pub trait EventSink: Send + Sync + 'static {
    fn dmx_render(&self, _output_id: u64, _data: &[u8]) {}
    fn wled_render(&self, _output_id: u64, _target: &WledRenderTarget) {}
    fn display_render(&self, _display_id: u64, _buffer: &DisplayBuffer) {}
    fn render_error(&self, _output_id: u64, _message: &str) {}
    fn render_error_clear(&self, _output_id: u64) {}

    fn project_updated(&self) {}
    fn beat_sampling_state(&self, _sampling: bool) {}

    fn midi_message(&self, _device_name: &str, _data: &[u8]) {}
    fn midi_connection_status(&self, _controller_name: &str, _connected: bool) {}

    fn audio_devices_changed(&self, _device_names: &[String]) {}
    fn audio_beat_active(&self, _active: bool) {}
    fn audio_analysis(&self, _analysis: &AudioAnalysis) {}
}

pub struct NullEventSink;

impl EventSink for NullEventSink {}
