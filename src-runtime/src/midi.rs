use crate::beat::SharedBeatSampler;
use crate::events::EventSink;
use dmx_engine::{
    midi::{ActionResult, ControlCommandType, calculate_midi_output, perform_action},
    project,
    proto::input_binding::Action::BeatMatch,
};
use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::oneshot;

#[derive(Deserialize, Serialize, Clone)]
pub struct MidiPortCandidate {
    id: String,
    name: String,
}

/// Shared state for MIDI input processing across all devices
struct MidiInputState {
    /// `MSB` buffers per device: `device_name` -> (channel -> value)
    msb_buffers: HashMap<String, HashMap<u8, u8>>,
    /// `LSB` buffers per device: `device_name` -> (channel -> value)
    lsb_buffers: HashMap<String, HashMap<u8, u8>>,
}

impl MidiInputState {
    fn new() -> Self {
        Self {
            msb_buffers: HashMap::new(),
            lsb_buffers: HashMap::new(),
        }
    }

    fn get_msb_buffer(&mut self, device_name: &str) -> &mut HashMap<u8, u8> {
        self.msb_buffers.entry(device_name.to_string()).or_default()
    }

    fn get_lsb_buffer(&mut self, device_name: &str) -> &mut HashMap<u8, u8> {
        self.lsb_buffers.entry(device_name.to_string()).or_default()
    }
}

/// Per-device connection state.
#[allow(dead_code)]
struct DeviceConnection {
    input_connection: MidiInputConnection<Arc<dyn EventSink>>,
    output_connection: Arc<StdMutex<Option<MidiOutputConnection>>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
}

pub struct MidiState {
    connections: StdMutex<HashMap<String, DeviceConnection>>,
    events: Arc<dyn EventSink>,
    watcher_cancel_tx: StdMutex<Option<tokio::sync::watch::Sender<bool>>>,
    /// Shared state for MIDI input processing (Arc for sharing with callbacks)
    input_state: Arc<StdMutex<MidiInputState>>,
    beat_sampler: SharedBeatSampler,
}

impl MidiState {
    pub fn new(events: Arc<dyn EventSink>, beat_sampler: SharedBeatSampler) -> Self {
        MidiState {
            connections: StdMutex::new(HashMap::new()),
            events,
            watcher_cancel_tx: StdMutex::new(None),
            input_state: Arc::new(StdMutex::new(MidiInputState::new())),
            beat_sampler,
        }
    }

    /// Start watching for MIDI device connections and auto-reconnect
    pub fn start_device_watcher(self: &Arc<Self>) {
        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);

        // Store the cancel sender
        {
            let mut watcher = self.watcher_cancel_tx.lock().unwrap();
            *watcher = Some(cancel_tx);
        }

        let state = Arc::clone(self);
        tokio::spawn(async move {
            Self::device_watcher_loop(state, cancel_rx).await;
        });

        log::info!("MIDI device watcher started");
    }

    async fn device_watcher_loop(
        state: Arc<MidiState>,
        mut cancel_rx: tokio::sync::watch::Receiver<bool>,
    ) {
        let mut known_devices: Vec<String> = Vec::new();

        loop {
            // Check for cancellation
            if *cancel_rx.borrow() {
                break;
            }

            // Get current available MIDI inputs
            if let Ok(current_devices) = list_midi_inputs() {
                let current_device_names: Vec<String> =
                    current_devices.iter().map(|d| d.name.clone()).collect();

                // Find newly appeared and disappeared devices
                let new_devices: Vec<MidiPortCandidate> = current_devices
                    .into_iter()
                    .filter(|device| !known_devices.contains(&device.name))
                    .collect();

                let disappeared_devices: Vec<String> = known_devices
                    .iter()
                    .filter(|device| !current_device_names.contains(device))
                    .cloned()
                    .collect();

                // Use controller_to_binding keys as the auto-reconnect allowlist
                let known_controller_names: Vec<String> = project::with_project(|p| {
                    Ok(p.controller_mapping
                        .as_ref()
                        .map(|cm| cm.controller_to_binding.keys().cloned().collect())
                        .unwrap_or_default())
                })
                .unwrap_or_default();

                // Handle disconnections
                for controller_name in &known_controller_names {
                    if disappeared_devices.contains(controller_name) {
                        log::info!("MIDI controller disconnected: {controller_name}");

                        disconnect_device(&state, controller_name);
                        state.emit_connection_status(controller_name, false);
                    }
                }

                // Handle new connections - auto-reconnect any known device
                for controller_name in &known_controller_names {
                    if let Some(matching_device) =
                        new_devices.iter().find(|d| &d.name == controller_name)
                    {
                        log::info!("Auto-reconnecting to MIDI controller: {controller_name}");

                        match connect_midi_internal(&state, matching_device.clone()) {
                            Ok(()) => {
                                state.emit_connection_status(controller_name, true);
                            }
                            Err(e) => {
                                log::error!(
                                    "Failed to auto-reconnect to MIDI controller '{controller_name}': {e}"
                                );
                            }
                        }
                    }
                }

                known_devices = current_device_names;
            }

            // Sleep for a short interval before checking again
            tokio::select! {
                () = tokio::time::sleep(tokio::time::Duration::from_secs(1)) => {},
                _ = cancel_rx.changed() => {
                    if *cancel_rx.borrow() {
                        break;
                    }
                }
            }
        }

        log::info!("MIDI device watcher loop exited");
    }

    fn emit_connection_status(&self, controller_name: &str, connected: bool) {
        self.events
            .midi_connection_status(controller_name, connected);
    }
}

pub fn list_midi_inputs() -> Result<Vec<MidiPortCandidate>, String> {
    let midi_input = MidiInput::new("DMX Controller App MIDI Input").map_err(|e| e.to_string())?;

    midi_input
        .ports()
        .into_iter()
        .map(|p| {
            midi_input
                .port_name(&p)
                .map_err(|e| e.to_string())
                .map(|name| MidiPortCandidate { id: p.id(), name })
        })
        .collect()
}

/// Internal connection function used by both the command and the watcher.
/// Adds a device connection without closing other existing connections.
fn connect_midi_internal(state: &MidiState, candidate: MidiPortCandidate) -> Result<(), String> {
    // Disconnect this specific device if already connected
    disconnect_device(state, &candidate.name);

    // Create MIDI input and find the port
    let midi_input = MidiInput::new("DMX Controller App MIDI Input").map_err(|e| e.to_string())?;

    let input_ports = midi_input.ports();
    let input_port = input_ports
        .iter()
        .find(|p| {
            midi_input
                .port_name(p)
                .is_ok_and(|name| name == candidate.name)
        })
        .ok_or_else(|| {
            let name = &candidate.name;
            format!("Input port '{name}' not found")
        })?
        .clone();

    // Capture device name, input state, and beat sampler for the MIDI callback
    let device_name_for_callback = candidate.name.clone();
    let input_state_for_callback = Arc::clone(&state.input_state);
    let beat_sampler_for_callback = Arc::clone(&state.beat_sampler);

    let input_connection = midi_input
        .connect(
            &input_port,
            "dmx-controller-input",
            move |_timestamp, message, events: &mut Arc<dyn EventSink>| {
                events.midi_message(&device_name_for_callback, message);

                process_midi_input(
                    events.as_ref(),
                    &device_name_for_callback,
                    message,
                    &input_state_for_callback,
                    &beat_sampler_for_callback,
                );
            },
            Arc::clone(&state.events),
        )
        .map_err(|e| e.to_string())?;

    // Try to find and connect to matching output port
    let midi_output =
        MidiOutput::new("DMX Controller App MIDI Output").map_err(|e| e.to_string())?;

    let output_connection: Arc<StdMutex<Option<MidiOutputConnection>>> =
        Arc::new(StdMutex::new(None));

    let output_ports = midi_output.ports();
    if let Some(output_port) = output_ports.iter().find(|p| {
        midi_output
            .port_name(p)
            .is_ok_and(|name| name == candidate.name)
    }) {
        if let Ok(conn) = midi_output.connect(output_port, "dmx-controller-output") {
            let mut out = output_connection
                .lock()
                .map_err(|e| format!("Failed to lock output connection: {e}"))?;
            *out = Some(conn);
        }
    }

    // Spawn MIDI output loop for this device
    let (shutdown_tx, mut shutdown_rx) = oneshot::channel();
    let output_conn_clone = Arc::clone(&output_connection);
    let device_name_for_output = candidate.name.clone();

    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_millis(33));

        loop {
            tokio::select! {
                _ = interval.tick() => {
                    output_midi_state_for_device(&device_name_for_output, &output_conn_clone);
                }
                _ = &mut shutdown_rx => {
                    break;
                }
            }
        }
    });

    // Store the device connection
    let device_conn = DeviceConnection {
        input_connection,
        output_connection,
        shutdown_tx: Some(shutdown_tx),
    };

    let mut connections = state
        .connections
        .lock()
        .map_err(|e| format!("Failed to lock connections: {e}"))?;
    connections.insert(candidate.name, device_conn);

    Ok(())
}

pub fn connect_midi(state: &MidiState, candidate: MidiPortCandidate) -> Result<(), String> {
    connect_midi_internal(state, candidate)
}

pub fn disconnect_midi(state: &MidiState, device_name: &str) {
    disconnect_device(state, device_name);
}

/// Disconnect a single device by name, leaving other devices connected.
fn disconnect_device(state: &MidiState, device_name: &str) {
    let mut connections = match state.connections.lock() {
        Ok(c) => c,
        Err(e) => {
            log::error!("Failed to lock connections: {e}");
            return;
        }
    };

    if let Some(mut device_conn) = connections.remove(device_name) {
        // Signal the output loop to stop
        if let Some(tx) = device_conn.shutdown_tx.take() {
            let _ = tx.send(());
        }
        // Dropping input_connection and output_connection closes them
    }
}

/// Output MIDI state for a specific device.
#[allow(clippy::cast_possible_truncation)]
fn output_midi_state_for_device(
    device_name: &str,
    output_conn: &Arc<StdMutex<Option<MidiOutputConnection>>>,
) {
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    // Calculate MIDI output values from project state
    let midi_output = calculate_midi_output(device_name, t);

    if let Ok(midi_output) = midi_output {
        if let Ok(mut output_conn) = output_conn.lock() {
            if let Some(connection) = output_conn.as_mut() {
                for (channel, value) in midi_output {
                    let channel_address: Vec<u8> = channel
                        .split(", ")
                        .map(|s| s.parse().expect("Parse error"))
                        .collect();

                    output_value(connection, &channel_address, value);
                }
            }
        }
    }
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
pub fn output_value(conn: &mut MidiOutputConnection, channel: &[u8], value: f64) {
    // CCs 0-31 support 14-bit resolution with LSB at CC+32
    if channel[1] < 32 {
        // 14-bit mode: map to 0-16383, split into MSB (bits 7-13) and LSB (bits 0-6)
        let value_14bit = (value.clamp(0.0, 1.0) * 16383.0).round() as u16;
        let msb = (value_14bit >> 7) as u8;
        let lsb = (value_14bit & 0x7F) as u8;

        let _ = conn.send(&[channel[0], channel[1], msb]);
        let _ = conn.send(&[channel[0], channel[1] + 32, lsb]);
    } else {
        // 7-bit mode: map to 0-127
        let value_7bit = (value.clamp(0.0, 1.0) * 127.0).round() as u8;
        let _ = conn.send(&[channel[0], channel[1], value_7bit]);
    }
}

/// Process incoming MIDI input and perform actions
fn process_midi_input(
    events: &dyn EventSink,
    device_name: &str,
    message: &[u8],
    input_state: &Arc<StdMutex<MidiInputState>>,
    beat_sampler: &SharedBeatSampler,
) {
    if message.len() < 3 {
        return;
    }

    let command = message[0];
    let data1 = message[1];
    let data2 = message[2];

    // Get binding ID for this device
    let Ok(Some(binding_id)) = project::with_project(|p| {
        Ok(p.controller_mapping
            .as_ref()
            .and_then(|cm| cm.controller_to_binding.get(device_name).copied()))
    }) else {
        return;
    };

    // Parse MIDI message and calculate value
    let (value, cct) = {
        let Ok(mut input_state_guard) = input_state.lock() else {
            return;
        };

        parse_midi_message(command, data1, data2, device_name, &mut input_state_guard)
    };

    let channel = format!("{command}, {data1}");
    #[allow(clippy::cast_possible_truncation)]
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    // Perform the action
    match perform_action(binding_id, &channel, value, cct, t) {
        Ok(action_result) => {
            handle_action_result(events, &action_result, beat_sampler, t);
        }
        Err(e) => {
            log::error!("Failed to perform MIDI action: {e}");
        }
    }
}

/// Parse MIDI message and return normalized value and control command type
fn parse_midi_message(
    command: u8,
    data1: u8,
    data2: u8,
    device_name: &str,
    input_state: &mut MidiInputState,
) -> (f64, Option<ControlCommandType>) {
    let mut value = f64::from(data2);
    let mut cct: Option<ControlCommandType> = None;

    // MIDI command reference:
    // 128-143: Note Off
    // 144-159: Note On
    // 160-175: Polyphonic Aftertouch
    // 176-191: Control Change
    // 192-207: Program Change
    // 208-223: Channel Aftertouch
    // 224-239: Pitch Bend

    if (128..144).contains(&command) {
        // Note off
        value /= 127.0;
    } else if (144..160).contains(&command) {
        // Note on
        value /= 127.0;
    } else if (160..176).contains(&command) {
        // Polyphonic aftertouch/pressure
        value /= 127.0;
    } else if (176..192).contains(&command) {
        // Control Change - handle MSB/LSB for 14-bit values
        if data1 < 32 {
            // MSB (0-31) - 14-bit resolution with paired LSB at CC+32
            let msb_buffer = input_state.get_msb_buffer(device_name);
            msb_buffer.insert(data1, data2);

            let lsb_buffer = input_state.get_lsb_buffer(device_name);
            let lsb = lsb_buffer.get(&(data1 + 32)).copied().unwrap_or(0);

            // 14-bit value: (MSB << 7) | LSB, range 0-16383
            let combined = (u16::from(data2) << 7) | u16::from(lsb);
            value = (f64::from(combined) / 16383.0).clamp(0.0, 1.0);
            cct = Some(ControlCommandType::Msb);
        } else if (32..64).contains(&data1) {
            // LSB (32-63) - 14-bit resolution paired with MSB at CC-32
            let lsb_buffer = input_state.get_lsb_buffer(device_name);
            lsb_buffer.insert(data1, data2);

            let msb_buffer = input_state.get_msb_buffer(device_name);
            let msb = msb_buffer.get(&(data1 - 32)).copied().unwrap_or(0);

            // 14-bit value: (MSB << 7) | LSB, range 0-16383
            let combined = (u16::from(msb) << 7) | u16::from(data2);
            value = (f64::from(combined) / 16383.0).clamp(0.0, 1.0);
            cct = Some(ControlCommandType::Lsb);
        } else {
            // Standard 7-bit CC (64-127)
            value /= 127.0;
        }
    } else {
        // Unsupported command type
        return (0.0, None);
    }

    (value, cct)
}

/// Handle the result of a MIDI action
fn handle_action_result(
    events: &dyn EventSink,
    result: &ActionResult,
    beat_sampler: &SharedBeatSampler,
    t: u64,
) {
    // Handle beat actions
    if let Some(action) = result.action {
        let Ok(mut sampler) = beat_sampler.lock() else {
            return;
        };

        // We want to handle beat matching at the runtime level.
        if let BeatMatch(_) = action {
            crate::beat::add_sample(&mut sampler, events, t);
        }

        drop(sampler); // Release lock before emitting
        if result.modified {
            events.project_updated();
        }
    }
}
