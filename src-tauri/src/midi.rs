use dmx_engine::{midi::calculate_midi_output, project::PROJECT_REF};
use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::oneshot;

#[derive(Deserialize, Serialize, Clone)]
pub struct MidiPortCandidate {
    id: String,
    name: String,
}

#[derive(Serialize, Clone)]
struct MidiMessage {
    data: Vec<u8>,
}

pub struct MidiState {
    input_connection: Mutex<Option<MidiInputConnection<AppHandle>>>,
    output_connection: Arc<Mutex<Option<MidiOutputConnection>>>,
    app_handle: Mutex<Option<AppHandle>>,
    shutdown_tx: Mutex<Option<oneshot::Sender<()>>>,
}

impl MidiState {
    pub fn new(app_handle: AppHandle) -> Self {
        MidiState {
            input_connection: Mutex::new(None),
            output_connection: Arc::new(Mutex::new(None)),
            app_handle: Mutex::new(Some(app_handle)),
            shutdown_tx: Mutex::new(None),
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

#[tauri::command]
pub fn connect_midi(state: State<MidiState>, candidate: MidiPortCandidate) -> Result<(), String> {
    // First disconnect any existing connections
    disconnect_midi(state.inner())?;

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

fn output_midi_state(output_conn: &Arc<Mutex<Option<MidiOutputConnection>>>) {
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
