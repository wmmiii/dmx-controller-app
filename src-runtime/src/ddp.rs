use std::collections::HashMap;
use std::collections::hash_map::Entry;
use std::net::UdpSocket;

use ddp_rs::connection::DDPConnection;
use ddp_rs::protocol::{ID, PixelConfig};
use dmx_engine::proto::{DdpOutput, DisplayBuffer, PhysicalDisplayMapping, VirtualMapping};
use dmx_engine::render::segment_mapping::map_segment_to_rgb;

#[derive(Default)]
pub struct DdpState {
    connections: HashMap<String, DDPConnection>,
}

impl DdpState {
    fn get_or_create_connection(&mut self, ip_address: &str) -> Result<&mut DDPConnection, String> {
        match self.connections.entry(ip_address.to_string()) {
            Entry::Occupied(entry) => Ok(entry.into_mut()),
            Entry::Vacant(entry) => {
                let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
                // DDP uses port 4048 by default
                let addr_with_port = format!("{ip_address}:4048");
                let connection = DDPConnection::try_new(
                    &addr_with_port,
                    PixelConfig::default(),
                    ID::Default,
                    socket,
                )
                .map_err(|e| e.to_string())?;
                Ok(entry.insert(connection))
            }
        }
    }

    /// Output DDP data for a physical display device.
    ///
    /// # Arguments
    /// * `buffers` - Map of virtual display ID to rendered pixel buffer
    /// * `ddp_output` - DDP output configuration (contains IP address and segments)
    /// * `output_id` - The output ID for this DDP device
    /// * `mappings` - Tuples of (`display_id`, mapping) for this output
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    pub(crate) fn output_ddp(
        &mut self,
        buffers: &HashMap<u64, DisplayBuffer>,
        ddp_output: &DdpOutput,
        output_id: u64,
        mappings: &[(u64, PhysicalDisplayMapping)],
    ) -> Result<(), String> {
        let mut data = Vec::new();

        // For each segment in this DDP output, find its mapping and serialize pixels
        for (segment_idx, segment) in ddp_output.segments.iter().enumerate() {
            // Find the mapping for this segment (with its display_id)
            let mapping_entry = mappings
                .iter()
                .find(|(_, m)| m.output == output_id && m.segment == segment_idx as u64);

            let segment_bytes = if let Some((display_id, mapping)) = mapping_entry {
                // Get the virtual display buffer for this mapping
                let virtual_mapping = mapping.mapping.as_ref().unwrap_or(&VirtualMapping {
                    top: 0,
                    left: 0,
                    rotate: 0,
                    flip_horizontally: false,
                    flip_vertically: false,
                });

                // Look up the buffer for this display
                if let Some(buffer) = buffers.get(display_id) {
                    let floats = map_segment_to_rgb(buffer, virtual_mapping, segment);
                    // Convert f32 [0.0, 1.0] to u8 [0, 255] with gamma correction for WS281X LEDs
                    floats.iter().map(|f| gamma_correct(*f)).collect()
                } else {
                    // No buffer available, output black
                    output_black_segment(segment)
                }
            } else {
                // No mapping for this segment, output black
                output_black_segment(segment)
            };

            data.extend(segment_bytes);
        }

        let conn = self.get_or_create_connection(&ddp_output.ip_address)?;
        conn.write(&data).map_err(|e| e.to_string())?;
        Ok(())
    }
}

/// Gamma correction for WS281X LEDs.
/// Gamma of 2.8 is typical for these LEDs to produce perceptually linear brightness.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn gamma_correct(value: f32) -> u8 {
    const GAMMA: f32 = 2.8;
    (value.clamp(0.0, 1.0).powf(GAMMA) * 255.0) as u8
}

/// Generate black pixels for a segment (when no mapping exists)
fn output_black_segment(segment: &dmx_engine::proto::PhysicalSegment) -> Vec<u8> {
    use dmx_engine::proto::physical_segment::Shape;

    let pixel_count = match &segment.shape {
        Some(Shape::Line(line)) => line.length as usize,
        Some(Shape::Rectangle(rect)) => (rect.width * rect.height) as usize,
        None => 0,
    };

    vec![0u8; pixel_count * 3]
}
