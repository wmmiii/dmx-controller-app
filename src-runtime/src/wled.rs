use dmx_engine::proto::wled_render_target::Segment;
use dmx_engine::proto::{Color, ColorPalette, WledRenderTarget};
use serde::{Deserialize, Serialize};

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn to_rgb_bytes(red: f64, green: f64, blue: f64, white: f64) -> [u8; 3] {
    let channel = |value: f64| ((value + white) * 255.0).floor() as u8;
    [channel(red), channel(green), channel(blue)]
}

fn palette_color_to_rgb(color: Option<&Color>) -> [u8; 3] {
    match color {
        Some(color) => to_rgb_bytes(
            color.red,
            color.green,
            color.blue,
            color.white.unwrap_or(0.0),
        ),
        None => [0, 0, 0],
    }
}

fn segment_colors(segment: &Segment, color_palette: Option<&ColorPalette>) -> [[u8; 3]; 3] {
    if segment.send_palette {
        if let Some(palette) = color_palette {
            return [&palette.primary, &palette.secondary, &palette.tertiary].map(|description| {
                palette_color_to_rgb(description.as_ref().and_then(|d| d.color.as_ref()))
            });
        }
    }

    let color = match segment.primary_color.as_ref() {
        Some(color) => to_rgb_bytes(
            f64::from(color.red),
            f64::from(color.green),
            f64::from(color.blue),
            0.0,
        ),
        None => [0, 0, 0],
    };
    [color, color, color]
}

pub struct WledState {
    client: reqwest::Client,
}

#[derive(Deserialize, Serialize)]
struct WledSegment {
    id: usize,
    col: [[u8; 3]; 3],
    fx: u32,
    sx: u8,
    pal: u32,
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

    // fx and pal go out unnarrowed: WLED documents them as 0..info.fxcount and
    // 0..info.palcount, so the ceiling is the device's and we would have to
    // query it to know. sx and bri really are bytes, and those casts saturate.
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    pub(crate) async fn output_wled(
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
                .map(|(index, segment)| WledSegment {
                    id: index,
                    col: segment_colors(segment, wled_render_target.color_palette.as_ref()),
                    fx: segment.effect,
                    sx: (segment.speed * 255.0).floor() as u8,
                    pal: segment.palette,
                    bri: (segment.brightness * 255.0).floor() as u8,
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
