const PREAMBLE = `#version 300 es
precision highp float;
precision highp int;

uniform vec4 u_color;
uniform float u_beat_t;
uniform uint u_time_ms;
uniform uint u_beat_count;
uniform vec2 u_resolution;
uniform float u_audio_bands[16];
uniform vec4 u_palette_primary;
uniform vec4 u_palette_secondary;
uniform vec4 u_palette_tertiary;
uniform sampler2D u_previous_texture;
uniform bool u_use_previous_texture;

out vec4 fragColor;

vec4 checkerboard(vec2 uv) {
    float c = mod(floor(uv.x / 32.0) + floor(uv.y / 32.0), 2.0) < 1.0 ? 0.3 : 0.7;
    return vec4(c, c, c, 1.0);
}

`;

// Count newlines so toUserLine stays correct if the preamble ever changes.
const PREAMBLE_LINES = (PREAMBLE.match(/\n/g) ?? []).length;

const EPILOGUE = `
void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec4 prev;
    if (u_use_previous_texture) {
        prev = texture(u_previous_texture, uv);
    } else {
        prev = checkerboard(gl_FragCoord.xy);
    }
    fragColor = visualizer(uv, gl_FragCoord.xy, prev);
}
`;

// Full-screen triangle — no vertex buffer needed.
export const VERTEX_SHADER_SRC = `#version 300 es
void main() {
    vec2 pos[3];
    pos[0] = vec2(-1.0, -1.0);
    pos[1] = vec2( 3.0, -1.0);
    pos[2] = vec2(-1.0,  3.0);
    gl_Position = vec4(pos[gl_VertexID], 0.0, 1.0);
}`;

export function wrapShaderWebGL2(glslSource: string): string {
  return PREAMBLE + glslSource + EPILOGUE;
}

// Translate a wrapped-shader line number from a WebGL error log back to the
// user's editor line number.
export function toUserLine(wrappedLine: number): number {
  return Math.max(1, wrappedLine - PREAMBLE_LINES);
}
