use dmx_engine::{midi::calculate_midi_output, project::PROJECT_REF};
use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{oneshot, Mutex};

#[derive(Deserialize, Serialize, Clone)]
pub struct MidiPortCandidate {
    id: String,
    name: String,
}

#[derive(Serialize, Clone)]
struct MidiMessage {
    data: Vec<u8>,
}

#[derive(Serialize, Clone)]
struct MidiConnectionStatusEvent {
    controller_name: String,
    connected: bool,
}

pub struct MidiState {
    input_connection: StdMutex<Option<MidiInputConnection<AppHandle>>>,
    output_connection: Arc<StdMutex<Option<MidiOutputConnection>>>,
    app_handle: StdMutex<Option<AppHandle>>,
    shutdown_tx: StdMutex<Option<oneshot::Sender<()>>>,
    watcher_cancel_tx: StdMutex<Option<tokio::sync::watch::Sender<bool>>>,
}

impl MidiState {
    pub fn new(app_handle: AppHandle) -> Self {
        MidiState {
            input_connection: StdMutex::new(None),
            output_connection: Arc::new(StdMutex::new(None)),
            app_handle: StdMutex::new(Some(app_handle)),
            shutdown_tx: StdMutex::new(None),
            watcher_cancel_tx: StdMutex::new(None),
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

                // Get the last controller name once
                let last_controller_name = PROJECT_REF
                    .lock()
                    .ok()
                    .and_then(|p| p.controller_mapping.as_ref().map(|cm| cm.last_controller_name.clone()))
                    .filter(|name| !name.is_empty());

                // Handle disconnections
                if let Some(ref controller_name) = last_controller_name {
                    if disappeared_devices.contains(controller_name) {
                        log::info!("MIDI controller disconnected: {}", controller_name);
                        Self::emit_connection_status(&state, controller_name, false).await;
                    }
                }

                // Handle new connections
                if let Some(ref controller_name) = last_controller_name {
                    if let Some(matching_device) = new_devices.iter().find(|d| &d.name == controller_name) {
                        log::info!("Auto-reconnecting to MIDI controller: {}", controller_name);

                        let result = {
                            let midi_state = state.lock().await;
                            connect_midi_internal(&midi_state, matching_device.clone())
                        }; // Lock dropped here

                        match result {
                            Ok(_) => {
                                Self::emit_connection_status(&state, controller_name, true).await;
                            }
                            Err(e) => {
                                log::error!("Failed to auto-reconnect to MIDI controller '{}': {}", controller_name, e);
                            }
                        }
                    }
                }

                known_devices = current_device_names;
            }

            // Sleep for a short interval before checking again
            tokio::select! {
                _ = tokio::time::sleep(tokio::time::Duration::from_secs(1)) => {},
                _ = cancel_rx.changed() => {
                    if *cancel_rx.borrow() {
                        break;
                    }
                }
            }
        }

        log::info!("MIDI device watcher loop exited");
    }

    async fn emit_connection_status(state: &Arc<Mutex<MidiState>>, controller_name: &str, connected: bool) {
        let midi_state = state.lock().await;
        if let Ok(app_handle_guard) = midi_state.app_handle.lock() {
            if let Some(app_handle) = app_handle_guard.as_ref() {
                let event = MidiConnectionStatusEvent {
                    controller_name: controller_name.to_string(),
                    connected,
                };
                if let Err(e) = app_handle.emit("midi-connection-status", &event) {
                    log::error!("Failed to emit midi-connection-status event: {}", e);
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

/// Internal connection function used by both the command and the watcher
fn connect_midi_internal(state: &MidiState, candidate: MidiPortCandidate) -> Result<(), String> {
    // First disconnect any existing connections
    disconnect_midi(state)?;

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
        .ok_or_else(|| format!("Input port '{}' not found", candidate.name))?
        .clone();

    // Get app handle for event emission
    let app_handle = state
        .app_handle
        .lock()
        .map_err(|e| format!("Failed to lock app handle: {}", e))?
        .as_ref()
        .ok_or("App handle not initialized")?
        .clone();

    let input_connection = midi_input
        .connect(
            &input_port,
            "dmx-controller-input",
            |_timestamp, message, app_handle| {
                let midi_msg = MidiMessage {
                    data: message.to_vec(),
                };

                if let Err(e) = app_handle.emit("midi-message", &midi_msg) {
                    eprintln!("Failed to emit MIDI event: {}", e);
                }
            },
            app_handle,
        )
        .map_err(|e| e.to_string())?;

    *state
        .input_connection
        .lock()
        .map_err(|e| format!("Failed to lock input connection: {}", e))? = Some(input_connection);

    // Try to find and connect to matching output port
    let midi_output =
        MidiOutput::new("DMX Controller App MIDI Output").map_err(|e| e.to_string())?;

    let output_ports = midi_output.ports();
    if let Some(output_port) = output_ports.iter().find(|p| {
        midi_output
            .port_name(p)
            .map(|name| name == candidate.name)
            .unwrap_or(false)
    }) {
        match midi_output.connect(output_port, "dmx-controller-output") {
            Ok(output_connection) => {
                let mut conn = state
                    .output_connection
                    .lock()
                    .map_err(|e| format!("Failed to lock output connection: {}", e))?;
                *conn = Some(output_connection);
            }
            Err(_) => (),
        }
    }

    // Spawn MIDI output loop
    let (shutdown_tx, mut shutdown_rx) = oneshot::channel();
    let output_conn_clone = Arc::clone(&state.output_connection);

    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_millis(33));

        loop {
            tokio::select! {
                _ = interval.tick() => {
                    output_midi_state(&output_conn_clone);
                }
                _ = &mut shutdown_rx => {
                    break;
                }
            }
        }
    });

    *state
        .shutdown_tx
        .lock()
        .map_err(|e| format!("Failed to lock shutdown_tx: {}", e))? = Some(shutdown_tx);

    Ok(())
}

#[tauri::command]
pub async fn connect_midi(state: State<'_, Arc<Mutex<MidiState>>>, candidate: MidiPortCandidate) -> Result<(), String> {
    let midi_state = state.lock().await;
    connect_midi_internal(&midi_state, candidate)
}

fn output_midi_state(output_conn: &Arc<StdMutex<Option<MidiOutputConnection>>>) {
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    if let Ok(project) = PROJECT_REF.lock() {
        let controller_name = project
            .controller_mapping
            .as_ref()
            .map(|cm| cm.last_controller_name.as_str())
            .unwrap_or("");

        if !controller_name.is_empty() {
            let midi_output = calculate_midi_output(&project, controller_name, t);

            if let Ok(mut output_conn) = output_conn.lock() {
                if let Some(connection) = output_conn.as_mut() {
                    for (channel, value) in midi_output {
                        let channel_address: Vec<u8> = channel
                            .split(", ")
                            .map(|s| s.parse().expect("Parse error"))
                            .collect();

                        output_value(connection, channel_address, value);
                    }
                }
            }
        }
    }
}

pub fn output_value(conn: &mut MidiOutputConnection, channel: Vec<u8>, value: f64) {
    let msb = (value * 127.0).round() as u8;

    let _ = conn.send(&[channel[0], channel[1], msb]);

    if channel[0] < 32 {
        let lsb = ((value * 127.0).fract() * 127.0).floor() as u8;
        let _ = conn.send(&[channel[0], channel[1] + 32, lsb]);
    }
}

pub fn disconnect_midi(state: &MidiState) -> Result<(), String> {
    // Shutdown the MIDI output loop
    let mut shutdown_tx = state
        .shutdown_tx
        .lock()
        .map_err(|e| format!("Failed to lock shutdown_tx: {}", e))?;
    if let Some(tx) = shutdown_tx.take() {
        let _ = tx.send(()); // Signal shutdown, ignore if receiver already dropped
    }

    // Disconnect input
    let mut input_conn = state
        .input_connection
        .lock()
        .map_err(|e| format!("Failed to lock input connection: {}", e))?;
    if input_conn.is_some() {
        *input_conn = None; // Dropping the connection closes it
    }

    // Disconnect output
    let mut output_conn = state
        .output_connection
        .lock()
        .map_err(|e| format!("Failed to lock output connection: {}", e))?;
    *output_conn = None; // Dropping the connection closes it

    Ok(())
}
