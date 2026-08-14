use dmx_runtime::events::EventSink;
use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};

/// The render loops report output errors every frame, so repeats are collapsed
/// to keep a single unreachable device from filling the log at frame rate.
#[derive(Default)]
pub struct LogEventSink {
    output_errors: Mutex<HashMap<u64, String>>,
}

impl LogEventSink {
    fn lock_output_errors(&self) -> MutexGuard<'_, HashMap<u64, String>> {
        self.output_errors.lock().unwrap_or_else(|e| {
            log::error!("Event sink lock poisoned, recovering");
            e.into_inner()
        })
    }
}

impl EventSink for LogEventSink {
    fn render_error(&self, output_id: u64, message: &str) {
        let mut output_errors = self.lock_output_errors();
        if output_errors.get(&output_id).is_some_and(|last| last == message) {
            return;
        }

        log::error!("Output {output_id} failed: {message}");
        output_errors.insert(output_id, message.to_string());
    }

    fn render_error_clear(&self, output_id: u64) {
        if self.lock_output_errors().remove(&output_id).is_some() {
            log::info!("Output {output_id} recovered");
        }
    }

    fn midi_connection_status(&self, controller_name: &str, connected: bool) {
        if connected {
            log::info!("MIDI controller connected: {controller_name}");
        } else {
            log::info!("MIDI controller disconnected: {controller_name}");
        }
    }

    fn audio_devices_changed(&self, device_names: &[String]) {
        log::info!("Audio inputs: {}", device_names.join(", "));
    }
}
