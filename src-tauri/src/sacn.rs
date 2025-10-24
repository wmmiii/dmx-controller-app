use sacn::packet::ACN_SDT_MULTICAST_PORT;
use sacn::source::SacnSource;
use std::net::{IpAddr, SocketAddr};
use std::sync::Mutex;
use tauri::State;

pub struct SacnState {
    source: Mutex<SacnSource>,
}

impl SacnState {
    pub fn new() -> Result<Self, String> {
        let local_addr: SocketAddr = SocketAddr::new(
            IpAddr::V4("0.0.0.0".parse().unwrap()),
            ACN_SDT_MULTICAST_PORT + 1,
        );

        let source = SacnSource::with_ip("DMX Controller App", local_addr)
            .map_err(|e| format!("Failed to create sACN source: {}", e))?;

        Ok(SacnState {
            source: Mutex::new(source),
        })
    }
}

#[tauri::command]
pub fn output_sacn_dmx(
    state: State<SacnState>,
    universe: u16,
    ip_address: String,
    data: Vec<u8>,
) -> Result<(), String> {
    // Prepend DMX start code (0x00) to the data
    let mut dmx_data = Vec::with_capacity(513);
    dmx_data.push(0x00); // DMX start code for standard dimmer data
    dmx_data.extend_from_slice(&data);

    let mut source = state
        .source
        .lock()
        .map_err(|e| format!("Failed to lock sACN source: {}", e))?;

    let ip_addr: IpAddr = ip_address
        .parse()
        .map_err(|e| format!("Invalid IP address '{}': {}", ip_address, e))?;
    let socket_addr = SocketAddr::new(ip_addr, ACN_SDT_MULTICAST_PORT);

    source
        .register_universe(universe)
        .map_err(|e| format!("Failed to register sACN DMX universe: {}", e))?;

    let result = source.send(&[universe], &dmx_data, Some(100), Some(socket_addr), None);

    result.map_err(|e| format!("Failed to send sACN DMX data: {}", e))?;

    println!("WE DID IT!!!");

    Ok(())
}
