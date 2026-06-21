//! Uniform buffer layout shared by every visualizer shader.
//!
//! The same set of uniforms is computed once from the final interpolated
//! `DisplayRenderTarget` state and passed to every shader render in the tree.
//! The field order, sizes and padding here must match the `Uniforms` block
//! declared in [`crate::visualizer::shader_wrap`]. The layout follows std140
//! rules (vec4-aligned blocks) so it can be uploaded directly to the GPU.
//!
//! ## std140 array padding
//!
//! In std140, every element of a `float arr[N]` uniform array is padded to
//! 16 bytes (one vec4 slot). `[Std140F32; N]` represents this on the CPU side.
//! The `_beat_align_pad` field covers the 12 implicit bytes std140 inserts to
//! align `_pad1[3]` to the next 16-byte boundary after `beat_t`.

/// A single f32 padded to 16 bytes to match std140 float-array element stride.
#[repr(C)]
#[derive(Copy, Clone, Debug, Default, bytemuck::Pod, bytemuck::Zeroable)]
struct Std140F32 {
    value: f32,
    _pad: [f32; 3],
}

/// Uniforms exposed to shaders. 400 bytes, std140-compatible.
///
/// Byte layout (must stay in sync with `shader_wrap::PREAMBLE`):
/// ```text
///   offset   0: color            [f32; 4]          16 bytes
///   offset  16: audio_bands_std140 [Std140F32; 16] 256 bytes
///   offset 272: beat_t           f32                4 bytes
///   offset 276: _beat_align_pad  [f32; 3]          12 bytes  (std140 gap before _pad1 array)
///   offset 288: _pad1            [Std140F32; 3]    48 bytes
///   offset 336: palette_primary  [f32; 4]          16 bytes
///   offset 352: palette_secondary [f32; 4]         16 bytes
///   offset 368: palette_tertiary  [f32; 4]         16 bytes
///   offset 384: resolution       [f32; 2]           8 bytes
///   offset 392: time             f32                4 bytes
///   offset 396: _pad2            f32                4 bytes
///   total: 400 bytes
/// ```
#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
#[allow(clippy::pub_underscore_fields)]
pub struct ShaderUniforms {
    /// Display color RGB + dimmer in `.a`.
    pub color: [f32; 4],
    /// Audio frequency bands (0.0-1.0), std140-padded to 16 bytes per element.
    audio_bands_std140: [Std140F32; 16],
    /// Beat phase (0.0-1.0).
    pub beat_t: f32,
    /// Explicit padding to satisfy std140's requirement that `_pad1[3]` starts
    /// on a 16-byte boundary (offset 288); without it the array would start at 276.
    _beat_align_pad: [f32; 3],
    /// Mirrors the GLSL `float _pad1[3]` slot (std140: 16 bytes per element).
    _pad1: [Std140F32; 3],
    /// Palette color 1.
    pub palette_primary: [f32; 4],
    /// Palette color 2.
    pub palette_secondary: [f32; 4],
    /// Palette color 3.
    pub palette_tertiary: [f32; 4],
    /// Display width, height in pixels.
    pub resolution: [f32; 2],
    /// Wall-clock time in milliseconds, wrapped modulo one day to fit an f32
    /// without losing millisecond precision.
    pub time: f32,
    pub _pad2: f32,
}

impl ShaderUniforms {
    pub fn set_audio_bands(&mut self, bands: [f32; 16]) {
        self.audio_bands_std140 = bands.map(|v| Std140F32 {
            value: v,
            _pad: [0.0; 3],
        });
    }
}

impl Default for ShaderUniforms {
    fn default() -> Self {
        Self {
            color: [0.0, 0.0, 0.0, 1.0],
            audio_bands_std140: [Std140F32::default(); 16],
            beat_t: 0.0,
            _beat_align_pad: [0.0; 3],
            _pad1: [Std140F32::default(); 3],
            palette_primary: [0.0, 0.0, 0.0, 1.0],
            palette_secondary: [0.0, 0.0, 0.0, 1.0],
            palette_tertiary: [0.0, 0.0, 0.0, 1.0],
            resolution: [0.0, 0.0],
            time: 0.0,
            _pad2: 0.0,
        }
    }
}
