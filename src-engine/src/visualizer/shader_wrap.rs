/// GLSL preamble injected before the user's code. Declares the uniform block
/// (must match [`crate::visualizer::uniforms::ShaderUniforms`]) and the
/// previous-pass texture/sampler.
const PREAMBLE: &str = "\
#version 450

layout(set = 0, binding = 0, std140) uniform Uniforms {
    vec3 u_color;                // offset 0: display color RGB
    float _pad_color;            // offset 12: padding for vec3
    vec2 u_resolution;           // offset 16
    float u_beat_t;              // offset 24: beat phase (0-1)
    uint u_time_ms;              // offset 28: time in milliseconds
    uint u_beat_count;           // offset 32: beat counter
    uint _pad0;                  // offset 36: padding for vec4 alignment
    vec2 _pad1;                  // offset 40: padding for vec3 alignment
    vec3 u_palette_primary;      // offset 48
    float _pad2;                 // offset 60: padding for vec3 alignment
    vec3 u_palette_secondary;    // offset 64
    float _pad3;                 // offset 76: padding for vec3 alignment
    vec3 u_palette_tertiary;     // offset 80
    float _pad4;                 // offset 92: padding for array alignment
    float u_audio_bands[16];     // offset 96: std140: each element takes 16 bytes
};

layout(set = 0, binding = 1) uniform texture2D t_previous;
layout(set = 0, binding = 2) uniform sampler s_previous;

// Clip-space position from vertex shader (ranges -1 to 1)
// Use smooth (perspective-correct) interpolation with centroid sampling to match WGSL
layout(location = 0) smooth centroid in vec2 v_clip_pos;

layout(location = 0) out vec4 fragColor;

";

/// GLSL appended after the user's code.
const EPILOGUE: &str = "
void main() {
    // Convert clip-space (-1..1) to UV (0..1), then to pixel coordinates
    vec2 uv = v_clip_pos * 0.5 + 0.5;
    vec2 frag_coord = uv * u_resolution.xy;
    vec4 prev = texture(sampler2D(t_previous, s_previous), uv);
    fragColor = visualizer(uv, frag_coord, prev);
}
";

/// Number of lines the preamble adds before the user's code. Used to translate
/// compiler error line numbers back to the user's editor coordinates.
#[must_use]
pub fn preamble_line_count() -> u32 {
    u32::try_from(PREAMBLE.lines().count()).unwrap_or(0)
}

#[must_use]
pub fn wrap_user_shader(user_source: &str) -> String {
    format!("{PREAMBLE}{user_source}{EPILOGUE}")
}
