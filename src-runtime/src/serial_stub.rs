/// Stands in for [`crate::serial::SerialState`] when the `serial` feature is
/// off, so a build without serial support still assembles a runtime.
#[derive(Default)]
pub struct SerialState {}

impl SerialState {
    pub fn auto_bind_serial_outputs(&self) -> Result<(), String> {
        Ok(())
    }

    pub fn output_dmx_internal(&self, _output_id: &str, _data: &[u8]) -> Result<(), String> {
        Ok(())
    }

    pub fn try_close_port(&self, _output_id: &str) -> Result<(), String> {
        Ok(())
    }
}
