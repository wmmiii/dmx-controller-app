use dmx_engine::project;
use dmx_engine::proto::SerialDmxOutput;
use dmx_engine::proto::output::Output as ProtoOutput;
use open_dmx::DMXSerial;
use serialport::available_ports;
use std::collections::HashMap;
use std::sync::Arc;
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
                        "Detected disconnected serial ports: {disappeared_ports:?}"
                    );

                    let serial = state.lock().await;
                    serial.close_disconnected_ports(&disappeared_ports);
                    drop(serial);
                }

                // If there are new ports, try to auto-bind
                if !new_ports.is_empty() {
                    log::info!("Detected new serial ports: {new_ports:?}");

                    let serial = state.lock().await;
                    if let Err(e) = serial.auto_bind_serial_outputs() {
                        log::error!("Failed to auto-bind after port detection: {e}");
                    }
                    drop(serial);
                }

                known_ports = current_port_names;
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

        log::info!("Port watcher loop exited");
    }

    /// Internal method for use by output loop
    pub fn output_dmx_internal(&self, output_id: &str, data: &[u8]) -> Result<(), String> {
        let mut ports = self
            .dmx_ports
            .lock()
            .map_err(|e| format!("Failed to lock DMX ports: {e}"))?;
        match ports.get_mut(output_id) {
            Some((_port_name, dmx_serial)) => {
                let mut dmx_data = [0u8; 512];
                let copy_len = std::cmp::min(data.len(), 512);
                dmx_data[..copy_len].copy_from_slice(&data[..copy_len]);

                dmx_serial.set_channels(dmx_data);
                dmx_serial
                    .update()
                    .map_err(|_| "DMX device disconnected".to_string())?;
                Ok(())
            }
            None => Err("Output not bound to any port".to_string()),
        }
    }

    /// Attempt to open a port for the given output
    pub fn try_open_port(&self, output_id: &str, port_name: &str) -> Result<(), String> {
        match DMXSerial::open_sync(port_name) {
            Ok(dmx_port) => {
                let mut ports = self
                    .dmx_ports
                    .lock()
                    .map_err(|e| format!("Failed to lock DMX ports: {e}"))?;

                ports.insert(output_id.to_string(), (port_name.to_string(), dmx_port));
                log::info!("Bound output '{output_id}' to port '{port_name}'");
                Ok(())
            }
            Err(e) => Err(format!("Failed to open DMX port '{port_name}': {e}")),
        }
    }

    /// Get the port name that the output is currently bound to
    pub fn get_bound_port_name(&self, output_id: &str) -> Option<String> {
        let ports = self.dmx_ports.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        ports.get(output_id).map(|(port_name, _)| port_name.clone())
    }

    /// Close a port if it's open
    pub fn try_close_port(&self, output_id: &str) -> Result<(), String> {
        let mut ports = self
            .dmx_ports
            .lock()
            .map_err(|e| format!("Failed to lock DMX ports: {e}"))?;

        if ports.remove(output_id).is_some() {
            log::info!("Closed port for output '{output_id}'");
        }
        Ok(())
    }

    /// Close ports that have been disconnected
    fn close_disconnected_ports(&self, disconnected_port_names: &[String]) {
        // Extract outputs to close from project (avoid holding lock during I/O)
        let outputs_to_close: Vec<(String, String)> = match project::with_project(|project| {
            let Some(active_patch) = project.patches.get(&project.active_patch) else {
                let active_patch_id = project.active_patch;
                log::warn!("Active patch {active_patch_id} not found");
                return Ok(Vec::new());
            };

            let mut to_close = Vec::new();
            for (output_id, output) in &active_patch.outputs {
                if let Some(ProtoOutput::SerialDmxOutput(SerialDmxOutput {
                    fixtures: _,
                    last_port: Some(last_port),
                })) = &output.output
                    && !last_port.is_empty()
                    && disconnected_port_names.contains(last_port)
                {
                    to_close.push((output_id.to_string(), last_port.clone()));
                }
            }
            Ok(to_close)
        }) {
            Ok(outputs) => outputs,
            Err(e) => {
                log::error!("Failed to get project while closing disconnected ports: {e}");
                return;
            }
        };

        // Close ports outside the project lock
        for (output_id_str, last_port) in outputs_to_close {
            if let Err(e) = self.try_close_port(&output_id_str) {
                log::error!("Failed to close disconnected port for output '{output_id_str}': {e}");
            } else {
                log::info!(
                    "Closed port '{last_port}' for output '{output_id_str}' due to disconnection"
                );
            }
        }
    }

    /// Auto-bind serial outputs to their last known ports if available
    pub fn auto_bind_serial_outputs(&self) -> Result<(), String> {
        // Get the list of available ports
        let available_port_names: Vec<String> = match available_ports() {
            Ok(ports) => ports.into_iter().map(|p| p.port_name).collect(),
            Err(e) => {
                log::warn!("Failed to list available ports for auto-binding: {e}");
                return Ok(()); // Don't fail the whole operation
            }
        };

        // Extract serial output configurations from project (avoid holding lock during I/O)
        // Returns: Vec<(output_id, desired_port)>
        let serial_outputs: Vec<(String, Option<String>)> = project::with_project(|project| {
            let Some(active_patch) = project.patches.get(&project.active_patch) else {
                let active_patch_id = project.active_patch;
                log::warn!("Active patch {active_patch_id} not found, skipping auto-bind");
                return Ok(Vec::new());
            };

            let mut outputs = Vec::new();
            for (output_id, output) in &active_patch.outputs {
                if !output.enabled {
                    continue;
                }
                if let Some(ProtoOutput::SerialDmxOutput(SerialDmxOutput {
                    fixtures: _,
                    last_port,
                })) = &output.output
                {
                    outputs.push((output_id.to_string(), last_port.clone()));
                }
            }
            Ok(outputs)
        })?;

        // Process each serial output outside the project lock
        for (output_id_str, desired_port_option) in serial_outputs {
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
                        "Output '{output_id_str}' has no last_port set, closing port '{current}'"
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
                if available_port_names.contains(&desired_port) {
                    // Close any existing port binding first
                    if let Some(current) = current_port {
                        log::debug!(
                            "Output '{output_id_str}' changing port from '{current}' to '{desired_port}'"
                        );
                        let _ = self.try_close_port(&output_id_str);
                    }

                    // Attempt to bind to the desired port
                    match self.try_open_port(&output_id_str, &desired_port) {
                        Ok(()) => {
                            log::info!(
                                "Successfully auto-bound output '{output_id_str}' to port '{desired_port}'"
                            );
                        }
                        Err(e) => {
                            log::warn!(
                                "Failed to auto-bind output '{output_id_str}' to port '{desired_port}': {e}"
                            );
                        }
                    }
                } else {
                    log::debug!(
                        "Desired port '{desired_port}' for output '{output_id_str}' not available"
                    );
                    // Close port if it's open but the desired port is not available
                    if current_port.is_some() {
                        let _ = self.try_close_port(&output_id_str);
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
