use dmx::{self, DmxTransmitter};
use dmx_serial::SystemPort;
use serialport::available_ports;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::{thread, time::Duration};

// Global map to store DMX ports by output identifier
static DMX_PORTS: LazyLock<Mutex<HashMap<String, SystemPort>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

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
pub fn open_port(output_id: String, port_name: String) -> Result<(), String> {
    match dmx::open_serial(&port_name) {
        Ok(dmx_port) => {
            let mut ports = DMX_PORTS.lock().unwrap();
            ports.insert(output_id.clone(), dmx_port);
            Ok(())
        }
        Err(e) => Err(format!("Failed to open DMX port '{}': {}", port_name, e)),
    }
}

#[tauri::command]
pub fn close_port(output_id: String) -> Result<(), String> {
    let mut ports = DMX_PORTS.lock().unwrap();
    match ports.remove(&output_id) {
        Some(_) => Ok(()),
        None => Err(format!("Output '{}' not found", output_id)),
    }
}

#[tauri::command]
pub fn output_dmx(output_id: String, data: Vec<u8>) -> Result<(), String> {
    let mut ports = DMX_PORTS.lock().unwrap();
    match ports.get_mut(&output_id) {
        Some(port) => match port.send_dmx_packet(&data) {
            Ok(_) => {
                thread::sleep(Duration::from_millis(20));
                Ok(())
            }
            Err(e) => Err(format!("Failed to write DMX data: {}", e)),
        },
        None => Err(format!("Output '{}' not bound to any port", output_id)),
    }
}
