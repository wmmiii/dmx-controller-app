use std::net::UdpSocket;

use dmx_engine::proto::WledRenderTarget;
use prost::Message;
use serde::{Deserialize, Serialize};
use tauri::State;

const WLED_UDP_PORT: u32 = 65506;

pub struct WledState {
    socket: UdpSocket,
}

#[derive(Deserialize, Serialize)]
struct WledSegment {
    id: u16,
    col: [[u8; 3]; 1],
    fx: u16,
    sx: u8,
    pal: u16,
    bri: u8,
}

#[derive(Deserialize, Serialize)]
struct WledJson {
    transition: u16,
    seg: Vec<WledSegment>,
}

impl WledState {
    pub fn new() -> Result<Self, String> {
        let socket = UdpSocket::bind("0.0.0.0:0")
            .map_err(|e| format!("Failed to bind to UDP socket for WLED: {}", e))?;

        Ok(WledState { socket: socket })
    }

    /// Internal method for use by output loop
    pub fn output_wled_internal(
        &self,
        ip_address: &str,
        wled_render_target: &WledRenderTarget,
    ) -> Result<(), String> {
        let json = WledJson {
            transition: 0,
            seg: wled_render_target
                .segments
                .iter()
                .enumerate()
                .map(|(i, s)| WledSegment {
                    id: i as u16,
                    col: [[
                        (s.primary_color.as_ref().map_or(0.0, |c| c.red) * 255.0).floor() as u8,
                        (s.primary_color.as_ref().map_or(0.0, |c| c.green) * 255.0).floor()
                            as u8,
                        (s.primary_color.as_ref().map_or(0.0, |c| c.blue) * 255.0).floor() as u8,
                    ]],
                    fx: s.effect as u16,
                    sx: (s.speed * 255.0).floor() as u8,
                    pal: s.palette as u16,
                    bri: (s.brightness * 255.0).floor() as u8,
                })
                .collect(),
        };

        let json_string = serde_json::to_string(&json)
            .map_err(|e| format!("Failed to serialize WLED JSON: {}", e))?;

        let address = format!("{}:{}", ip_address, WLED_UDP_PORT)
            .parse::<std::net::SocketAddr>()
            .map_err(|e| format!("Failed to parse WLED address: {}", e))?;

        self.socket
            .send_to(json_string.as_bytes(), address)
            .map_err(|e| format!("Failed to send WLED JSON: {}", e))?;

        Ok(())
    }
}

#[tauri::command]
pub async fn output_wled(
    state: State<'_, Arc<TokioMutex<WledState>>>,
    ip_address: String,
    wled_render_target_bin: Vec<u8>,
) -> Result<(), String> {
    let wled_render_target = WledRenderTarget::decode(wled_render_target_bin.as_slice())
        .map_err(|e| format!("Failed to deserialize WLED render target: {}", e))?;

    let wled_state = state.lock().await;
    wled_state.output_wled_internal(&ip_address, &wled_render_target)
}
