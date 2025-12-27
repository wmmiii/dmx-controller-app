use std::sync::Arc;

use dmx_engine::proto::WledRenderTarget;
use prost::Message;
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::sync::Mutex;

pub struct WledState {
    client: reqwest::Client,
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
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_millis(500))
            .build()
            .map_err(|e| format!("Failed to create HTTP client for WLED: {}", e))?;

        Ok(WledState { client })
    }

    /// Internal method for use by output loop
    pub async fn output_wled_internal(
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
                        (s.primary_color.as_ref().map_or(0.0, |c| c.green) * 255.0).floor() as u8,
                        (s.primary_color.as_ref().map_or(0.0, |c| c.blue) * 255.0).floor() as u8,
                    ]],
                    fx: s.effect as u16,
                    sx: (s.speed * 255.0).floor() as u8,
                    pal: s.palette as u16,
                    bri: (s.brightness * 255.0).floor() as u8,
                })
                .collect(),
        };

        let url = format!("http://{}/json/state", ip_address);

        self.client
            .post(&url)
            .json(&json)
            .send()
            .await
            .map_err(|e| format!("Failed to send WLED HTTP request: {}", e))?;

        Ok(())
    }
}

#[tauri::command]
pub async fn output_wled(
    state: State<'_, Arc<Mutex<WledState>>>,
    ip_address: String,
    wled_render_target_bin: Vec<u8>,
) -> Result<(), String> {
    let wled_render_target = WledRenderTarget::decode(wled_render_target_bin.as_slice())
        .map_err(|e| format!("Failed to deserialize WLED render target: {}", e))?;

    let wled_state = state.lock().await;
    wled_state.output_wled_internal(&ip_address, &wled_render_target).await
}
