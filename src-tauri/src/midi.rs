use midir::{MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use serde::{Deserialize, Serialize};
use std::sync::{LazyLock, Mutex};
use tauri::{AppHandle, Emitter};

#[derive(Deserialize, Serialize, Clone)]
pub struct MidiPortCandidate {
    id: String,
    name: String,
}

#[derive(Serialize, Clone)]
struct MidiMessage {
    data: Vec<u8>,
}

// Global storage for active connections
static MIDI_INPUT_CONNECTION: LazyLock<Mutex<Option<MidiInputConnection<AppHandle>>>> =
    LazyLock::new(|| Mutex::new(None));

static MIDI_OUTPUT_CONNECTION: LazyLock<Mutex<Option<MidiOutputConnection>>> =
    LazyLock::new(|| Mutex::new(None));

// Global app handle for event emission
static APP_HANDLE: LazyLock<Mutex<Option<AppHandle>>> = LazyLock::new(|| Mutex::new(None));

// Function to initialize the app handle (called from main)
pub fn init_midi_events(app_handle: AppHandle) {
    *APP_HANDLE.lock().unwrap() = Some(app_handle);
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
pub fn connect_midi(candidate: MidiPortCandidate) -> Result<(), String> {
    // First disconnect any existing connections
    disconnect_midi()?;

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
    let app_handle = APP_HANDLE
        .lock()
        .unwrap()
        .as_ref()
        .ok_or("App handle not initialized")?
        .clone();

    // Connect to input port (this consumes midi_input)
    let input_connection = midi_input
        .connect(
            &input_port,
            "dmx-controller-input",
            |_timestamp, message, app_handle| {
                // Create MIDI message and emit event to frontend
                let midi_msg = MidiMessage {
                    data: message.to_vec(),
                };

                // Emit event to frontend (non-blocking)
                if let Err(e) = app_handle.emit("midi-message", &midi_msg) {
                    eprintln!("Failed to emit MIDI event: {}", e);
                }
            },
            app_handle,
        )
        .map_err(|e| e.to_string())?;

    // Store the input connection
    *MIDI_INPUT_CONNECTION.lock().unwrap() = Some(input_connection);

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
                *MIDI_OUTPUT_CONNECTION.lock().unwrap() = Some(output_connection);
                Ok(())
            }
            Err(_) => {
                // Input connected but output failed - still success
                Ok(())
            }
        }
    } else {
        Ok(())
    }
}

pub fn disconnect_midi() -> Result<(), String> {
    // Disconnect input
    let mut input_conn = MIDI_INPUT_CONNECTION.lock().unwrap();
    if input_conn.is_some() {
        *input_conn = None; // Dropping the connection closes it
    }

    // Disconnect output
    let mut output_conn = MIDI_OUTPUT_CONNECTION.lock().unwrap();
    if output_conn.is_some() {
        *output_conn = None; // Dropping the connection closes it
    }

    Ok(())
}

#[tauri::command]
pub fn send_midi_command(data: Vec<u8>) -> Result<(), String> {
    let mut output_conn = MIDI_OUTPUT_CONNECTION.lock().unwrap();

    match output_conn.as_mut() {
        Some(connection) => {
            connection
                .send(&data)
                .map_err(|e| format!("Failed to send MIDI message: {}", e))?;
            Ok(())
        }
        None => Err("No MIDI output connection available".to_string()),
    }
}
