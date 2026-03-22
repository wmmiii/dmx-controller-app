use dmx_engine::proto::WledRenderTarget;
use serde::{Deserialize, Serialize};

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
            .map_err(|e| format!("Failed to create HTTP client for WLED: {e}"))?;

        Ok(WledState { client })
    }

    /// Internal method for use by output loop
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
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
                    id: u16::try_from(i).unwrap(),
                    col: [[
                        (s.primary_color.as_ref().map_or(0.0, |c| c.red) * 255.0).floor() as u8,
                        (s.primary_color.as_ref().map_or(0.0, |c| c.green) * 255.0).floor() as u8,
                        (s.primary_color.as_ref().map_or(0.0, |c| c.blue) * 255.0).floor() as u8,
                    ]],
                    fx: u16::try_from(s.effect).unwrap(),
                    #[allow(clippy::cast_sign_loss)]
                    sx: (s.speed * 255.0).floor() as u8,
                    pal: u16::try_from(s.palette).unwrap(),
                    #[allow(clippy::cast_possible_truncation)]
                    #[allow(clippy::cast_sign_loss)]
                    bri: (s.brightness * 255.0).floor() as u8,
                })
                .collect(),
        };

        let url = format!("http://{ip_address}/json/state");

        let response = self
            .client
            .post(&url)
            .json(&json)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        match response.error_for_status() {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("WLED device returned error: {e}")),
        }
    }
}
