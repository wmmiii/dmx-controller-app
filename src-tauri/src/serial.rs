use dmx_engine::project::PROJECT_REF;
use dmx_engine::proto::SerialDmxOutput;
use dmx_engine::proto::output::Output as ProtoOutput;
use open_dmx::DMXSerial;
use serialport::available_ports;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

pub struct SerialState {
    dmx_ports: std::sync::Mutex<HashMap<String, (String, DMXSerial)>>, // output_id -> (port_name, connection)
    watcher_cancel_tx: std::sync::Mutex<Option<tokio::sync::watch::Sender<bool>>>,
}

impl SerialState {
    pub fn new() -> Self {
        SerialState {
            dmx_ports: std::sync::Mutex::new(HashMap::new()),
            watcher_cancel_tx: std::sync::Mutex::new(None),
        }
    }

    /// Start watching for new serial ports and auto-binding
    pub fn start_port_watcher(&self, state: Arc<Mutex<SerialState>>) {
        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);

        // Store the cancel sender
        {
            let mut watcher = self.watcher_cancel_tx.lock().unwrap();
            *watcher = Some(cancel_tx);
        }

        // Spawn the watcher task using Tauri's async runtime
        tauri::async_runtime::spawn(async move {
            Self::port_watcher_loop(state, cancel_rx).await;
        });

        log::info!("Serial port watcher started");
    }

    async fn port_watcher_loop(
        state: Arc<Mutex<SerialState>>,
        mut cancel_rx: tokio::sync::watch::Receiver<bool>,
    ) {
        let mut known_ports: Vec<String> = Vec::new();

        loop {
            // Check for cancellation
            if *cancel_rx.borrow() {
                break;
            }

            // Get current available ports
            if let Ok(current_ports) = available_ports() {
                let current_port_names: Vec<String> =
                    current_ports.into_iter().map(|p| p.port_name).collect();

                // Find newly appeared ports
                let new_ports: Vec<String> = current_port_names
                    .iter()
                    .filter(|port| !known_ports.contains(port))
                    .cloned()
                    .collect();

                // Find disappeared ports
                let disappeared_ports: Vec<String> = known_ports
                    .iter()
                    .filter(|port| !current_port_names.contains(port))
                    .cloned()
                    .collect();

                // Close ports that have disappeared
                if !disappeared_ports.is_empty() {
                    log::info!(
                        "Detected disconnected serial ports: {:?}",
                        disappeared_ports
                    );

                    let serial = state.lock().await;
                    serial.close_disconnected_ports(&disappeared_ports);
                    drop(serial);
                }

                // If there are new ports, try to auto-bind
                if !new_ports.is_empty() {
                    log::info!("Detected new serial ports: {:?}", new_ports);

                    let serial = state.lock().await;
                    if let Err(e) = serial.auto_bind_serial_outputs() {
                        log::error!("Failed to auto-bind after port detection: {}", e);
                    }
                    drop(serial);
                }

                known_ports = current_port_names;
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

        log::info!("Port watcher loop exited");
    }

    /// Internal method for use by output loop
    pub fn output_dmx_internal(&self, output_id: &str, data: &[u8]) -> Result<(), String> {
        let mut ports = self
            .dmx_ports
            .lock()
            .map_err(|e| format!("Failed to lock DMX ports: {}", e))?;
        match ports.get_mut(output_id) {
            Some((_port_name, dmx_serial)) => {
                let mut dmx_data = [0u8; 512];
                let copy_len = std::cmp::min(data.len(), 512);
                dmx_data[..copy_len].copy_from_slice(&data[..copy_len]);

                dmx_serial.set_channels(dmx_data);
                Ok(())
            }
            None => Err("Output not bound to any port".to_string()),
        }
    }

    /// Attempt to open a port for the given output
    pub fn try_open_port(&self, output_id: &str, port_name: &str) -> Result<(), String> {
        match DMXSerial::open(port_name) {
            Ok(dmx_port) => {
                let mut ports = self
                    .dmx_ports
                    .lock()
                    .map_err(|e| format!("Failed to lock DMX ports: {}", e))?;

                ports.insert(output_id.to_string(), (port_name.to_string(), dmx_port));
                log::info!("Bound output '{}' to port '{}'", output_id, port_name);
                Ok(())
            }
            Err(e) => Err(format!("Failed to open DMX port '{}': {}", port_name, e)),
        }
    }

    /// Get the port name that the output is currently bound to
    pub fn get_bound_port_name(&self, output_id: &str) -> Option<String> {
        let ports = self.dmx_ports.lock().unwrap_or_else(|e| e.into_inner());
        ports.get(output_id).map(|(port_name, _)| port_name.clone())
    }

    /// Close a port if it's open
    pub fn try_close_port(&self, output_id: &str) -> Result<(), String> {
        let mut ports = self
            .dmx_ports
            .lock()
            .map_err(|e| format!("Failed to lock DMX ports: {}", e))?;

        if ports.remove(output_id).is_some() {
            log::info!("Closed port for output '{}'", output_id);
        }
        Ok(())
    }

    /// Close ports that have been disconnected
    fn close_disconnected_ports(&self, disconnected_port_names: &[String]) {
        // Get the current project to find which outputs are using the disconnected ports
        let project = match PROJECT_REF.lock() {
            Ok(p) => p.clone(),
            Err(e) => {
                log::error!(
                    "Failed to lock project while closing disconnected ports: {}",
                    e
                );
                return;
            }
        };

        let active_patch_id = project.active_patch;
        let active_patch = match project.patches.get(&active_patch_id) {
            Some(patch) => patch,
            None => {
                log::warn!("Active patch {} not found", active_patch_id);
                return;
            }
        };

        // Find outputs that were using the disconnected ports
        for (output_id, output) in &active_patch.outputs {
            if let Some(ProtoOutput::SerialDmxOutput(SerialDmxOutput {
                fixtures: _,
                last_port: Some(last_port),
            })) = &output.output
                && !last_port.is_empty()
                && disconnected_port_names.contains(last_port)
            {
                let output_id_str = output_id.to_string();
                if let Err(e) = self.try_close_port(&output_id_str) {
                    log::error!(
                        "Failed to close disconnected port for output '{}': {}",
                        output_id_str,
                        e
                    );
                } else {
                    log::info!(
                        "Closed port '{}' for output '{}' due to disconnection",
                        last_port,
                        output_id_str
                    );
                }
            }
        }
    }

    /// Auto-bind serial outputs to their last known ports if available
    pub fn auto_bind_serial_outputs(&self) -> Result<(), String> {
        // Get the list of available ports
        let available_port_names: Vec<String> = match available_ports() {
            Ok(ports) => ports.into_iter().map(|p| p.port_name).collect(),
            Err(e) => {
                log::warn!("Failed to list available ports for auto-binding: {}", e);
                return Ok(()); // Don't fail the whole operation
            }
        };

        // Read the current project to get serial output configurations
        let project = PROJECT_REF
            .lock()
            .map_err(|e| format!("Failed to lock project: {}", e))?
            .clone();

        let active_patch_id = project.active_patch;
        let active_patch = match project.patches.get(&active_patch_id) {
            Some(patch) => patch,
            None => {
                log::warn!(
                    "Active patch {} not found, skipping auto-bind",
                    active_patch_id
                );
                return Ok(());
            }
        };

        // Iterate through outputs and auto-bind serial outputs with last_port set
        for (output_id, output) in &active_patch.outputs {
            if let Some(ProtoOutput::SerialDmxOutput(SerialDmxOutput {
                fixtures: _,
                last_port: desired_port_option,
            })) = &output.output
            {
                let output_id_str = output_id.to_string();
                let current_port = self.get_bound_port_name(&output_id_str);

                // Determine if we need to rebind
                let needs_rebind = match (
                    &current_port,
                    desired_port_option.as_ref().is_some_and(|p| !p.is_empty()),
                ) {
                    (None, false) => false, // Not bound and no port desired - nothing to do
                    (None, true) => true,   // Not bound but should be - bind it
                    (Some(current), false) => {
                        // Bound but no port desired - unbind it
                        log::debug!(
                            "Output '{}' has no last_port set, closing port '{}'",
                            output_id_str,
                            current
                        );
                        let _ = self.try_close_port(&output_id_str);
                        false
                    }
                    (Some(current), true) => current != desired_port_option.as_ref().unwrap(), // Check if port changed
                };

                if let Some(desired_port) = desired_port_option
                    && !desired_port.is_empty()
                    && needs_rebind
                {
                    // Check if the desired port is available
                    if available_port_names.contains(desired_port) {
                        // Close any existing port binding first
                        if let Some(current) = current_port {
                            log::debug!(
                                "Output '{}' changing port from '{}' to '{}'",
                                output_id_str,
                                current,
                                desired_port
                            );
                            let _ = self.try_close_port(&output_id_str);
                        }

                        // Attempt to bind to the desired port
                        match self.try_open_port(&output_id_str, desired_port) {
                            Ok(_) => {
                                log::info!(
                                    "Successfully auto-bound output '{}' to port '{}'",
                                    output_id_str,
                                    desired_port
                                );
                            }
                            Err(e) => {
                                log::warn!(
                                    "Failed to auto-bind output '{}' to port '{}': {}",
                                    output_id_str,
                                    desired_port,
                                    e
                                );
                            }
                        }
                    } else {
                        log::debug!(
                            "Desired port '{}' for output '{}' not available",
                            desired_port,
                            output_id_str
                        );
                        // Close port if it's open but the desired port is not available
                        if current_port.is_some() {
                            let _ = self.try_close_port(&output_id_str);
                        }
                    }
                }
            }
        }

        Ok(())
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

            ports.insert(output_id.clone(), (port_name.clone(), dmx_port));
            log::info!("Opened port '{}' for output '{}'", port_name, output_id);
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

    if ports.remove(&output_id).is_some() {
        log::info!("Closed port for output '{}'", output_id);
        Ok(())
    } else {
        Err(format!("Output '{}' not found", output_id))
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
