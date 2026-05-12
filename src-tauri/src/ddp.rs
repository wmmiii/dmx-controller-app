use std::collections::HashMap;
use std::net::UdpSocket;

use ddp_rs::connection::DDPConnection;
use ddp_rs::protocol::{ID, PixelConfig};
use dmx_engine::proto::DdpRenderTarget;

pub struct DdpState {
    connections: HashMap<String, DDPConnection>,
}

impl DdpState {
    pub fn new() -> Self {
        DdpState {
            connections: HashMap::new(),
        }
    }

    fn get_or_create_connection(&mut self, ip_address: &str) -> Result<&mut DDPConnection, String> {
        if !self.connections.contains_key(ip_address) {
            let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
            // DDP uses port 4048 by default
            let addr_with_port = format!("{ip_address}:4048");
            let conn =
                DDPConnection::try_new(&addr_with_port, PixelConfig::default(), ID::Default, socket)
                    .map_err(|e| e.to_string())?;
            self.connections.insert(ip_address.to_string(), conn);
        }
        Ok(self.connections.get_mut(ip_address).unwrap())
    }

    /// Internal method for use by output loop
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    pub fn output_ddp_internal(
        &mut self,
        ip_address: &str,
        ddp_render_target: &DdpRenderTarget,
    ) -> Result<(), String> {
        let dimmer = f64::from(ddp_render_target.dimmer);
        let size = ddp_render_target.size as usize;

        // Extract RGB values, adding white to all channels
        let (r, g, b) = if let Some(c) = &ddp_render_target.color {
            let white = c.white.unwrap_or(0.0);
            (c.red + white, c.green + white, c.blue + white)
        } else {
            (0.0, 0.0, 0.0)
        };

        // Apply dimmer and map to 0-255, clipping at 255
        let r = ((r * dimmer) * 255.0).min(255.0) as u8;
        let g = ((g * dimmer) * 255.0).min(255.0) as u8;
        let b = ((b * dimmer) * 255.0).min(255.0) as u8;

        // Create repeated RGB data for 'size' pixels
        let mut data = Vec::with_capacity(size * 3);
        for _ in 0..size {
            data.push(r);
            data.push(g);
            data.push(b);
        }

        let conn = self.get_or_create_connection(ip_address)?;
        conn.write(&data).map_err(|e| e.to_string())?;
        Ok(())
    }
}
