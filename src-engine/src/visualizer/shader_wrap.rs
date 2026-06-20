//! Wraps a user-authored `visualizer()` function with the GLSL boilerplate
//! (version, uniform block, texture/sampler bindings and `main`) needed for it
//! to run as a fragment shader. This is pure string manipulation so the same
//! wrapping can be reused by a future WebGL preview in the browser.

/// GLSL preamble injected before the user's code. Declares the uniform block
/// (must match [`crate::visualizer::uniforms::ShaderUniforms`]) and the
/// previous-pass texture/sampler.
const PREAMBLE: &str = "\
#version 450

layout(set = 0, binding = 0) uniform Uniforms {
    vec4 u_color;
    float u_audio_bands[16];
    float u_beat_t;
    float _pad1[3];
    vec4 u_palette_primary;
    vec4 u_palette_secondary;
    vec4 u_palette_tertiary;
    vec2 u_resolution;
    float u_time;
    float _pad2;
};

layout(set = 0, binding = 1) uniform texture2D t_previous;
layout(set = 0, binding = 2) uniform sampler s_previous;

layout(location = 0) out vec4 fragColor;

";

/// GLSL appended after the user's code. Calls `visualizer()` with the screen
/// uv and the previous pass's pixel.
const EPILOGUE: &str = "
void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec4 prev = texture(sampler2D(t_previous, s_previous), uv);
    fragColor = visualizer(uv, gl_FragCoord.xy, prev);
}
";

/// Number of lines the preamble adds before the user's code. Used to translate
/// compiler error line numbers back to the user's editor coordinates.
#[must_use]
pub fn preamble_line_count() -> u32 {
    u32::try_from(PREAMBLE.lines().count()).unwrap_or(0)
}

/// Wrap a user `visualizer()` function into a complete fragment shader.
#[must_use]
pub fn wrap_user_shader(user_source: &str) -> String {
    format!("{PREAMBLE}{user_source}{EPILOGUE}")
}
