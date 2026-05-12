use crate::proto::DisplayBuffer;
use crate::proto::DisplayRenderTarget;

/// Placeholder for GPU shader rendering pipeline.
/// Will be replaced with wgpu-based shader execution.
#[allow(clippy::cast_possible_truncation)]
pub fn render_display_shaders(
    display_id: u64,
    width: u32,
    height: u32,
    system_t: u64,
    uniforms: &DisplayRenderTarget,
) -> DisplayBuffer {
    let mut buffer = DisplayBuffer::new(display_id, width, height);

    let dim = uniforms.dimmer;

    // Convert system_t (microseconds) to seconds and use for hue offset.
    // Use f64 for precision, then mod 1.0 to keep the offset small.
    let time_offset = (((system_t as f64 / 1_000.0) * 0.1) % 1.0) as f32;

    // Render a hue gradient from upper-left to lower-right for testing
    let max_dist = ((width.saturating_sub(1) + height.saturating_sub(1)) as f32).max(1.0);

    for y in 0..height {
        for x in 0..width {
            // Diagonal distance normalized to [0, 1], offset by time
            let t = ((x + y) as f32 / max_dist + time_offset) % 1.0;
            let (r, g, b) = hsv_to_rgb(t, 1.0, dim);
            buffer.set(x, y, r, g, b);
        }
    }

    buffer
}

/// Convert HSV to RGB. H is in [0, 1], S and V are in [0, 1].
fn hsv_to_rgb(h: f32, s: f32, v: f32) -> (f32, f32, f32) {
    let h = h * 6.0;
    let i = h.floor() as i32;
    let f = h - i as f32;

    let p = v * (1.0 - s);
    let q = v * (1.0 - s * f);
    let t = v * (1.0 - s * (1.0 - f));

    match i % 6 {
        0 => (v, t, p),
        1 => (q, v, p),
        2 => (p, v, t),
        3 => (p, q, v),
        4 => (t, p, v),
        _ => (v, p, q),
    }
}
