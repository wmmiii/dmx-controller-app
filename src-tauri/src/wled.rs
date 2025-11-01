use std::{fmt::format, net::UdpSocket};

use dmx_engine::proto::{wled_render_target, WledRenderTarget};
use prost::Message;
use tauri::State;

const WLED_UDP_PORT: u32 = 65506;

pub struct WledState {
    socket: UdpSocket,
}

impl WledState {
    pub fn new() -> Result<Self, String> {
        let socket = UdpSocket::bind(format!("127.0.0.1:{}", WLED_UDP_PORT + 1))
            .map_err(|e| format!("Failed to bind to UDP socket for WLED: {}", e))?;

        Ok(WledState { socket: socket })
    }
}

#[tauri::command]
pub fn output_wled(
    state: State<WledState>,
    output_id: String,
    wled_render_target_bin: Vec<u8>,
) -> Result<(), String> {
    let wled_render_target = WledRenderTarget::decode(wled_render_target_bin.as_slice())
        .map_err(|e| format!("Failed to deserialize WLED render target: {}", e))?;

    Install the https://crates.io/crates/wled-json-api-library crate and make the JSON
}
