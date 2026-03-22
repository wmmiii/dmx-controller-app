use dmx_engine::{
    midi::{ActionResult, ControlCommandType, calculate_midi_output, perform_action},
    project, proto,
};
use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{Mutex, oneshot};

use crate::project::emit_project_update;

#[derive(Deserialize, Serialize, Clone)]
pub struct MidiPortCandidate {
    id: String,
    name: String,
}

#[derive(Serialize, Clone)]
struct MidiMessage {
    device_name: String,
    data: Vec<u8>,
}

#[derive(Serialize, Clone)]
struct MidiConnectionStatusEvent {
    controller_name: String,
    connected: bool,
}

/// Event payload for beat sampling state
#[derive(Serialize, Clone)]
struct BeatSamplingEvent {
    sampling: bool,
}

const MAX_BEAT_SAMPLES: usize = 16;

/// Shared state for MIDI input processing across all devices
pub struct MidiInputState {
    /// `MSB` buffers per device: `device_name` -> (channel -> value)
    msb_buffers: HashMap<String, HashMap<u8, u8>>,
    /// `LSB` buffers per device: `device_name` -> (channel -> value)
    lsb_buffers: HashMap<String, HashMap<u8, u8>>,
    /// Beat sample timestamps for tempo detection
    beat_samples: Vec<u64>,
    /// Number of beats counted in current sampling session
    beat_count: u32,
    /// Whether we're currently sampling beats
    sampling: bool,
    /// Handle to cancel the beat finalization timeout
    beat_timeout_cancel: Option<tokio::sync::oneshot::Sender<()>>,
}

impl MidiInputState {
    fn new() -> Self {
        Self {
            msb_buffers: HashMap::new(),
            lsb_buffers: HashMap::new(),
            beat_samples: Vec::new(),
            beat_count: 0,
            sampling: false,
            beat_timeout_cancel: None,
        }
    }

    fn get_msb_buffer(&mut self, device_name: &str) -> &mut HashMap<u8, u8> {
        self.msb_buffers
            .entry(device_name.to_string())
            .or_default()
    }

    fn get_lsb_buffer(&mut self, device_name: &str) -> &mut HashMap<u8, u8> {
        self.lsb_buffers
            .entry(device_name.to_string())
            .or_default()
    }

    /// Calculate beat duration from samples
    #[allow(clippy::cast_precision_loss)]
    fn calculate_beat_duration(&self) -> Option<f64> {
        if self.beat_samples.len() < 2 {
            return None;
        }

        let total_length = self.beat_samples[self.beat_samples.len() - 1] - self.beat_samples[0];
        let mut length_ms = total_length as f64 / (self.beat_samples.len() - 1) as f64;
        let bpm = 60_000.0 / length_ms;

        // Try to snap to nearest whole BPM
        let nearest_whole_bpm = bpm.round();
        if (nearest_whole_bpm - bpm).abs() < 0.1 {
            length_ms = 60_000.0 / nearest_whole_bpm;
        }

        Some(length_ms)
    }

    /// Add a beat sample
    fn add_beat_sample(&mut self, t: u64) {
        self.beat_samples.push(t);
        if self.beat_samples.len() > MAX_BEAT_SAMPLES {
            self.beat_samples.remove(0);
        }
        self.beat_count += 1;
        self.sampling = true;
    }

    /// Set first beat (resets beat count)
    #[allow(clippy::cast_precision_loss)]
    fn set_first_beat(&mut self, t: u64) {
        if self.beat_samples.is_empty() {
            // Direct set - handled in project update
        } else {
            // Check if this is close to the last sample
            let last = self.beat_samples[self.beat_samples.len() - 1];
            let beat_length = self.calculate_beat_duration().unwrap_or(500.0);
            if ((last as f64) - (t as f64)).abs() < beat_length / 2.0 {
                self.beat_count = 0;
            } else {
                self.beat_count = 1;
            }
        }
    }

    /// Performs the first beat action. Returns true if `beat_samples` was empty
    /// (meaning the offset was set directly in project).
    fn perform_first_beat(&mut self, t: u64) -> bool {
        let was_empty = self.beat_samples.is_empty();
        self.set_first_beat(t);
        was_empty
    }

    /// Finalize beat sampling and update project
    #[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    fn finalize_sampling(&mut self) -> Option<(f64, u64)> {
        if let Some(length_ms) = self.calculate_beat_duration() {
            let last_sample = self.beat_samples[self.beat_samples.len() - 1];
            let first_beat = last_sample as f64 - (f64::from(self.beat_count) - 1.0) * length_ms;
            let offset = first_beat.round() as u64;

            self.beat_samples.clear();
            self.beat_count = 0;
            self.sampling = false;

            Some((length_ms, offset))
        } else {
            self.beat_samples.clear();
            self.beat_count = 0;
            self.sampling = false;
            None
        }
    }
}

/// Per-device connection state.
#[allow(dead_code)]
struct DeviceConnection {
    input_connection: MidiInputConnection<AppHandle>,
    output_connection: Arc<StdMutex<Option<MidiOutputConnection>>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
}

pub struct MidiState {
    connections: StdMutex<HashMap<String, DeviceConnection>>,
    app_handle: StdMutex<Option<AppHandle>>,
    watcher_cancel_tx: StdMutex<Option<tokio::sync::watch::Sender<bool>>>,
    /// Shared state for MIDI input processing (Arc for sharing with callbacks)
    input_state: Arc<StdMutex<MidiInputState>>,
}

impl MidiState {
    pub fn new(app_handle: AppHandle) -> Self {
        MidiState {
            connections: StdMutex::new(HashMap::new()),
            app_handle: StdMutex::new(Some(app_handle)),
            watcher_cancel_tx: StdMutex::new(None),
            input_state: Arc::new(StdMutex::new(MidiInputState::new())),
        }
    }

    /// Start watching for MIDI device connections and auto-reconnect
    pub fn start_device_watcher(&self, state: Arc<Mutex<MidiState>>) {
        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);

        // Store the cancel sender
        {
            let mut watcher = self.watcher_cancel_tx.lock().unwrap();
            *watcher = Some(cancel_tx);
        }

        // Spawn the watcher task using Tauri's async runtime
        tauri::async_runtime::spawn(async move {
            Self::device_watcher_loop(state, cancel_rx).await;
        });

        log::info!("MIDI device watcher started");
    }

    async fn device_watcher_loop(
        state: Arc<Mutex<MidiState>>,
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

                        // Remove the connection from state
                        {
                            let midi_state = state.lock().await;
                            disconnect_device(&midi_state, controller_name);
                        }

                        Self::emit_connection_status(&state, controller_name, false).await;
                    }
                }

                // Handle new connections - auto-reconnect any known device
                for controller_name in &known_controller_names {
                    if let Some(matching_device) =
                        new_devices.iter().find(|d| &d.name == controller_name)
                    {
                        log::info!("Auto-reconnecting to MIDI controller: {controller_name}");

                        let result = {
                            let midi_state = state.lock().await;
                            connect_midi_internal(&midi_state, matching_device.clone())
                        }; // Lock dropped here

                        match result {
                            Ok(()) => {
                                Self::emit_connection_status(&state, controller_name, true).await;
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

    async fn emit_connection_status(
        state: &Arc<Mutex<MidiState>>,
        controller_name: &str,
        connected: bool,
    ) {
        let midi_state = state.lock().await;
        if let Ok(app_handle_guard) = midi_state.app_handle.lock() {
            if let Some(app_handle) = app_handle_guard.as_ref() {
                let event = MidiConnectionStatusEvent {
                    controller_name: controller_name.to_string(),
                    connected,
                };
                if let Err(e) = app_handle.emit("midi-connection-status", &event) {
                    log::error!("Failed to emit midi-connection-status event: {e}");
                }
            }
        }
    }
}

#[tauri::command]
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
                .map(|name| name == candidate.name)
                .unwrap_or(false)
        })
        .ok_or_else(|| {
            let name = &candidate.name;
            format!("Input port '{name}' not found")
        })?
        .clone();

    // Get app handle for event emission
    let app_handle = state
        .app_handle
        .lock()
        .map_err(|e| format!("Failed to lock app handle: {e}"))?
        .as_ref()
        .ok_or("App handle not initialized")?
        .clone();

    // Capture device name and input state for the MIDI callback
    let device_name_for_callback = candidate.name.clone();
    let input_state_for_callback = Arc::clone(&state.input_state);

    let input_connection = midi_input
        .connect(
            &input_port,
            "dmx-controller-input",
            move |_timestamp, message, app_handle| {
                // Emit midi-message event for debugging (ControllerPage)
                let midi_msg = MidiMessage {
                    device_name: device_name_for_callback.clone(),
                    data: message.to_vec(),
                };
                if let Err(e) = app_handle.emit("midi-message", &midi_msg) {
                    eprintln!("Failed to emit MIDI event: {e}");
                }

                // Process the MIDI input
                process_midi_input(
                    app_handle,
                    &device_name_for_callback,
                    message,
                    &input_state_for_callback,
                );
            },
            app_handle,
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
            .map(|name| name == candidate.name)
            .unwrap_or(false)
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

    tauri::async_runtime::spawn(async move {
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

#[tauri::command]
pub async fn connect_midi(
    state: State<'_, Arc<Mutex<MidiState>>>,
    candidate: MidiPortCandidate,
) -> Result<(), String> {
    let midi_state = state.lock().await;
    connect_midi_internal(&midi_state, candidate)
}

#[tauri::command]
pub async fn disconnect_midi(
    state: State<'_, Arc<Mutex<MidiState>>>,
    device_name: String,
) -> Result<(), String> {
    let midi_state = state.lock().await;
    disconnect_device(&midi_state, &device_name);
    Ok(())
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
    let msb = (value * 127.0).round() as u8;

    let _ = conn.send(&[channel[0], channel[1], msb]);

    if channel[0] < 32 {
        let lsb = ((value * 127.0).fract() * 127.0).floor() as u8;
        let _ = conn.send(&[channel[0], channel[1] + 32, lsb]);
    }
}

/// Process incoming MIDI input and perform actions
fn process_midi_input(
    app_handle: &AppHandle,
    device_name: &str,
    message: &[u8],
    input_state: &Arc<StdMutex<MidiInputState>>,
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
            handle_action_result(app_handle, &action_result, input_state, t);
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
            // MSB (0-31)
            let msb_buffer = input_state.get_msb_buffer(device_name);
            msb_buffer.insert(data1, data2);

            let lsb_buffer = input_state.get_lsb_buffer(device_name);
            let lsb = lsb_buffer.get(&(data1 + 32)).copied().unwrap_or(0);

            value = f64::from(data2) + f64::from(lsb) / 127.0;
            cct = Some(ControlCommandType::Msb);
        } else if (32..64).contains(&data1) {
            // LSB (32-63)
            let lsb_buffer = input_state.get_lsb_buffer(device_name);
            lsb_buffer.insert(data1, data2);

            let msb_buffer = input_state.get_msb_buffer(device_name);
            let msb = msb_buffer.get(&(data1 - 32)).copied().unwrap_or(0);

            value = f64::from(msb) + f64::from(data2) / 127.0;
            cct = Some(ControlCommandType::Lsb);
        }
        value /= 127.0;
    } else {
        // Unsupported command type
        return (0.0, None);
    }

    (value, cct)
}

/// Handle the result of a MIDI action
fn handle_action_result(
    app_handle: &AppHandle,
    result: &ActionResult,
    input_state: &Arc<StdMutex<MidiInputState>>,
    t: u64,
) {
    // Handle beat actions
    if let Some(action) = result.action {
        let Ok(mut input_state_guard) = input_state.lock() else {
            return;
        };

        match action {
            proto::input_binding::Action::BeatMatch(_) => {
                let was_sampling = input_state_guard.sampling;
                input_state_guard.add_beat_sample(t);

                // Emit sampling state if it changed
                if !was_sampling {
                    let _ = app_handle
                        .emit("beat-sampling-state", BeatSamplingEvent { sampling: true });
                }

                // Schedule beat finalization timeout
                let input_state_clone = Arc::clone(input_state);
                let app_handle_clone = app_handle.clone();
                let beat_duration = input_state_guard
                    .calculate_beat_duration()
                    .unwrap_or(2000.0);

                // Cancel any existing timeout
                if let Some(cancel_tx) = input_state_guard.beat_timeout_cancel.take() {
                    let _ = cancel_tx.send(());
                }

                let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel();
                input_state_guard.beat_timeout_cancel = Some(cancel_tx);

                drop(input_state_guard); // Release lock before spawning

                tauri::async_runtime::spawn(async move {
                    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
                    let duration_ms = beat_duration.round() as u64;
                    tokio::select! {
                        () = tokio::time::sleep(Duration::from_millis(duration_ms)) => {
                            finalize_beat_sampling(&app_handle_clone, &input_state_clone);
                        }
                        _ = &mut cancel_rx => {
                            // Cancelled, do nothing
                        }
                    }
                });
            }
            proto::input_binding::Action::FirstBeat(_) => {
                drop(input_state_guard);
                handle_first_beat_action(app_handle, input_state, t);
            }
            _ => {}
        }
    }

    // Mark project dirty if modified (will emit when frontend is ready)
    if result.modified {
        emit_project_update(app_handle, None);
    }
}

/// Handle the first beat action - shared by MIDI input and keyboard shortcut.
/// Sets the beat offset directly if no samples are being collected.
fn handle_first_beat_action(
    app_handle: &AppHandle,
    input_state: &Arc<StdMutex<MidiInputState>>,
    t: u64,
) {
    let was_empty = {
        let Ok(mut input_state_guard) = input_state.lock() else {
            return;
        };
        input_state_guard.perform_first_beat(t)
    };

    if was_empty {
        // Directly set the offset in the project
        let _ = project::with_project_mut(|project| {
            if let Some(ref mut beat) = project.live_beat {
                beat.offset_ms = t;
            }
            Ok(true)
        });

        emit_project_update(app_handle, Some("Manually set first beat.".to_string()));
    }
}

/// Finalize beat sampling and update the project
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn finalize_beat_sampling(app_handle: &AppHandle, input_state: &Arc<StdMutex<MidiInputState>>) {
    let beat_data = {
        let Ok(mut input_state_guard) = input_state.lock() else {
            return;
        };
        input_state_guard.finalize_sampling()
    };

    if let Some((length_ms, offset_ms)) = beat_data {
        // Update project with new beat data
        let _ = project::with_project_mut(|project| {
            if let Some(ref mut beat) = project.live_beat {
                beat.length_ms = length_ms;
                beat.offset_ms = offset_ms;
            }
            Ok(true)
        });

        let bpm = (60_000.0 / length_ms).round() as u32;
        emit_project_update(app_handle, Some(format!("Set beat to {bpm} BPM.")));
    }

    // Emit sampling state change
    let _ = app_handle.emit("beat-sampling-state", BeatSamplingEvent { sampling: false });
}

/// Add a beat sample for tempo detection (called from keyboard shortcut)
#[tauri::command]
#[allow(clippy::cast_possible_truncation)]
pub async fn add_beat_sample(
    app: AppHandle,
    state: State<'_, Arc<Mutex<MidiState>>>,
) -> Result<(), String> {
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;

    let midi_state = state.lock().await;
    let input_state = Arc::clone(&midi_state.input_state);
    drop(midi_state);

    let was_sampling = {
        let mut input_state_guard = input_state
            .lock()
            .map_err(|e| format!("Failed to lock input state: {e}"))?;

        let was_sampling = input_state_guard.sampling;
        input_state_guard.add_beat_sample(t);
        was_sampling
    };

    // Emit sampling state if it changed
    if !was_sampling {
        let _ = app.emit("beat-sampling-state", BeatSamplingEvent { sampling: true });
    }

    // Schedule beat finalization timeout
    let input_state_clone = Arc::clone(&input_state);
    let app_clone = app.clone();

    let beat_duration = {
        let input_state_guard = input_state
            .lock()
            .map_err(|e| format!("Failed to lock input state: {e}"))?;
        input_state_guard
            .calculate_beat_duration()
            .unwrap_or(2000.0)
    };

    // Cancel any existing timeout
    {
        let mut input_state_guard = input_state
            .lock()
            .map_err(|e| format!("Failed to lock input state: {e}"))?;

        if let Some(cancel_tx) = input_state_guard.beat_timeout_cancel.take() {
            let _ = cancel_tx.send(());
        }

        let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel();
        input_state_guard.beat_timeout_cancel = Some(cancel_tx);

        drop(input_state_guard);

        tauri::async_runtime::spawn(async move {
            #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
            let duration_ms = beat_duration.round() as u64;
            tokio::select! {
                () = tokio::time::sleep(Duration::from_millis(duration_ms)) => {
                    finalize_beat_sampling(&app_clone, &input_state_clone);
                }
                _ = &mut cancel_rx => {
                    // Cancelled, do nothing
                }
            }
        });
    }

    Ok(())
}
