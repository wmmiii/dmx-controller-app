use open_dmx::DMXSerial;
use serialport::available_ports;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

pub struct SerialState {
    dmx_ports: std::sync::Mutex<HashMap<String, DMXSerial>>,
}

impl SerialState {
    pub fn new() -> Self {
        SerialState {
            dmx_ports: std::sync::Mutex::new(HashMap::new()),
        }
    }

    /// Internal method for use by output loop
    pub fn output_dmx_internal(&self, output_id: &str, data: &[u8]) -> Result<(), String> {
        let mut ports = self
            .dmx_ports
            .lock()
            .map_err(|e| format!("Failed to lock DMX ports: {}", e))?;
        match ports.get_mut(output_id) {
            Some(port) => {
                let mut dmx_data = [0u8; 512];
                let copy_len = std::cmp::min(data.len(), 512);
                dmx_data[..copy_len].copy_from_slice(&data[..copy_len]);

                port.set_channels(dmx_data);
                Ok(())
            }
            None => Err(format!("Output '{}' not bound to any port", output_id)),
        }
    }
}

#[tauri::command]
pub fn list_ports() -> Result<Vec<String>, String> {
    match available_ports() {
        Ok(ports) => {
            let port_names: Vec<String> = ports.into_iter().map(|port| port.port_name).collect();
            Ok(port_names)
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn open_port(
    state: State<'_, Arc<Mutex<SerialState>>>,
    output_id: String,
    port_name: String,
) -> Result<(), String> {
    match DMXSerial::open(&port_name) {
        Ok(dmx_port) => {
            let serial_state = state.lock().await;
            let mut ports = serial_state
                .dmx_ports
                .lock()
                .map_err(|e| format!("Failed to lock DMX ports: {}", e))?;
            ports.insert(output_id.clone(), dmx_port);
            Ok(())
        }
        Err(e) => Err(format!("Failed to open DMX port '{}': {}", port_name, e)),
    }
}

#[tauri::command]
pub async fn close_port(
    state: State<'_, Arc<Mutex<SerialState>>>,
    output_id: String,
) -> Result<(), String> {
    let serial_state = state.lock().await;
    let mut ports = serial_state
        .dmx_ports
        .lock()
        .map_err(|e| format!("Failed to lock DMX ports: {}", e))?;
    match ports.remove(&output_id) {
        Some(_) => Ok(()),
        None => Err(format!("Output '{}' not found", output_id)),
    }
}

#[tauri::command]
pub async fn output_serial_dmx(
    state: State<'_, Arc<Mutex<SerialState>>>,
    output_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let serial_state = state.lock().await;
    serial_state.output_dmx_internal(&output_id, &data)
}
