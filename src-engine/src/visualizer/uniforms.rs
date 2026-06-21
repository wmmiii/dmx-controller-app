/// A single f32 padded to 16 bytes to match std140 float-array element stride.
#[repr(C)]
#[derive(Copy, Clone, Debug, Default, bytemuck::Pod, bytemuck::Zeroable)]
struct Std140F32 {
    value: f32,
    _pad: [f32; 3],
}

/// Uniforms exposed to shaders. 352 bytes, std140-compatible.
///
/// Byte layout (must stay in sync with `shader_wrap::PREAMBLE`):
/// ```text
///   offset   0: color              [f32; 3]          12 bytes
///   offset  12: _pad_color         f32                4 bytes  (padding for vec3)
///   offset  16: resolution         [f32; 2]           8 bytes
///   offset  24: beat_t             f32                4 bytes
///   offset  28: time_ms            u32                4 bytes
///   offset  32: beat_count         u32                4 bytes
///   offset  36: _pad               u32                4 bytes  (padding for vec4 alignment)
///   offset  40: _pad2              [f32; 2]           8 bytes  (padding for vec3 alignment)
///   offset  48: palette_primary    [f32; 3]          12 bytes
///   offset  60: _pad3              f32                4 bytes  (padding for vec3 alignment)
///   offset  64: palette_secondary  [f32; 3]          12 bytes
///   offset  76: _pad4              f32                4 bytes  (padding for vec3 alignment)
///   offset  80: palette_tertiary   [f32; 3]          12 bytes
///   offset  92: _pad5              f32                4 bytes  (padding for array alignment)
///   offset  96: audio_bands        [Std140F32; 16]  256 bytes  (std140: 16 bytes per element)
///   total: 352 bytes
/// ```
#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
#[allow(clippy::pub_underscore_fields)]
pub struct ShaderUniforms {
    /// Display color RGB.
    pub color: [f32; 3],
    /// Padding for vec3 alignment.
    _pad_color: f32,
    /// Resolution (width, height).
    pub resolution: [f32; 2],
    /// Beat phase (0.0-1.0 position within current beat).
    pub beat_t: f32,
    /// Time in milliseconds. Wraps at 2^32 ms (~49.7 days).
    pub time_ms: u32,
    /// Beat counter. Wraps at 2^32 beats.
    pub beat_count: u32,
    /// Padding to align next vec4 to 16-byte boundary.
    _pad: u32,
    /// Additional padding for vec3 alignment.
    _pad2: [f32; 2],
    /// Palette color 1.
    pub palette_primary: [f32; 3],
    /// Padding for vec3 alignment.
    _pad3: f32,
    /// Palette color 2.
    pub palette_secondary: [f32; 3],
    /// Padding for vec3 alignment.
    _pad4: f32,
    /// Palette color 3.
    pub palette_tertiary: [f32; 3],
    /// Padding for array alignment.
    _pad5: f32,
    /// Audio frequency bands (0.0-1.0), std140-padded to 16 bytes per element.
    audio_bands: [Std140F32; 16],
}

impl ShaderUniforms {
    /// Set audio bands from a 16-element array.
    pub fn set_audio_bands(&mut self, bands: [f32; 16]) {
        self.audio_bands = bands.map(|v| Std140F32 {
            value: v,
            _pad: [0.0; 3],
        });
    }

    /// Set resolution (width, height).
    pub fn set_resolution(&mut self, width: f32, height: f32) {
        self.resolution[0] = width;
        self.resolution[1] = height;
    }
}

impl Default for ShaderUniforms {
    fn default() -> Self {
        Self {
            color: [0.0, 0.0, 0.0],
            _pad_color: 0.0,
            resolution: [0.0; 2],
            beat_t: 0.0,
            time_ms: 0,
            beat_count: 0,
            _pad: 0,
            _pad2: [0.0; 2],
            palette_primary: [0.0, 0.0, 0.0],
            _pad3: 0.0,
            palette_secondary: [0.0, 0.0, 0.0],
            _pad4: 0.0,
            palette_tertiary: [0.0, 0.0, 0.0],
            _pad5: 0.0,
            audio_bands: [Std140F32::default(); 16],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::mem::offset_of;

    #[test]
    fn test_shader_uniforms_layout() {
        // Expected std140 byte offsets (must match GLSL uniform block)
        assert_eq!(
            offset_of!(ShaderUniforms, color),
            0,
            "color should be at offset 0"
        );
        assert_eq!(
            offset_of!(ShaderUniforms, _pad_color),
            12,
            "_pad_color should be at offset 12"
        );
        assert_eq!(
            offset_of!(ShaderUniforms, resolution),
            16,
            "resolution should be at offset 16"
        );
        assert_eq!(
            offset_of!(ShaderUniforms, beat_t),
            24,
            "beat_t should be at offset 24"
        );
        assert_eq!(
            offset_of!(ShaderUniforms, time_ms),
            28,
            "time_ms should be at offset 28"
        );
        assert_eq!(
            offset_of!(ShaderUniforms, beat_count),
            32,
            "beat_count should be at offset 32"
        );
        assert_eq!(
            offset_of!(ShaderUniforms, _pad),
            36,
            "_pad should be at offset 36"
        );
        assert_eq!(
            offset_of!(ShaderUniforms, _pad2),
            40,
            "_pad2 should be at offset 40"
        );
        assert_eq!(
            offset_of!(ShaderUniforms, palette_primary),
            48,
            "palette_primary should be at offset 48"
        );
        assert_eq!(
            offset_of!(ShaderUniforms, _pad3),
            60,
            "_pad3 should be at offset 60"
        );
        assert_eq!(
            offset_of!(ShaderUniforms, palette_secondary),
            64,
            "palette_secondary should be at offset 64"
        );
        assert_eq!(
            offset_of!(ShaderUniforms, _pad4),
            76,
            "_pad4 should be at offset 76"
        );
        assert_eq!(
            offset_of!(ShaderUniforms, palette_tertiary),
            80,
            "palette_tertiary should be at offset 80"
        );
        assert_eq!(
            offset_of!(ShaderUniforms, _pad5),
            92,
            "_pad5 should be at offset 92"
        );
        assert_eq!(
            offset_of!(ShaderUniforms, audio_bands),
            96,
            "audio_bands should be at offset 96"
        );
        assert_eq!(
            std::mem::size_of::<ShaderUniforms>(),
            352,
            "total size should be 352 bytes"
        );
    }
}
