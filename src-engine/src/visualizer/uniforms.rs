//! Uniform buffer layout shared by every visualizer shader.
//!
//! The same set of uniforms is computed once from the final interpolated
//! `DisplayRenderTarget` state and passed to every shader render in the tree.
//! The field order, sizes and padding here must match the `Uniforms` block
//! declared in [`crate::visualizer::shader_wrap`]. The layout follows std140
//! rules (vec4-aligned blocks) so it can be uploaded directly to the GPU and
//! later reused by a WebGL preview.

/// Uniforms exposed to shaders. 160 bytes, 16-byte aligned.
#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
#[allow(clippy::pub_underscore_fields)]
pub struct ShaderUniforms {
    /// Display color RGB + dimmer in `.a`.
    pub color: [f32; 4],
    /// Audio frequency bands (0.0-1.0).
    pub audio_bands: [f32; 16],
    /// Beat phase (0.0-1.0).
    pub beat_t: f32,
    pub _pad1: [f32; 3],
    /// Palette color 1.
    pub palette_primary: [f32; 4],
    /// Palette color 2.
    pub palette_secondary: [f32; 4],
    /// Palette color 3.
    pub palette_tertiary: [f32; 4],
    /// Display width, height in pixels.
    pub resolution: [f32; 2],
    /// Wall-clock time in milliseconds, wrapped modulo one day to fit an f32
    /// without losing millisecond precision. u64 is not supported as shader variable format
    /// values.
    pub time: f32,
    pub _pad2: f32,
}

impl Default for ShaderUniforms {
    fn default() -> Self {
        Self {
            color: [0.0, 0.0, 0.0, 1.0],
            audio_bands: [0.0; 16],
            beat_t: 0.0,
            _pad1: [0.0; 3],
            palette_primary: [0.0, 0.0, 0.0, 1.0],
            palette_secondary: [0.0, 0.0, 0.0, 1.0],
            palette_tertiary: [0.0, 0.0, 0.0, 1.0],
            resolution: [0.0, 0.0],
            time: 0.0,
            _pad2: 0.0,
        }
    }
}
