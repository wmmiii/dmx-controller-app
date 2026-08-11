// Available uniforms:
//   vec3  u_color             — display color RGB
//   float u_audio_bands[16]   — frequency bands, 0.0-1.0 (low to high)
//   float u_beat_t            — beat phase, 0.0-1.0 (position within beat)
//   float u_beat_count        — beat number
//   vec3  u_palette_primary   — palette color 1
//   vec3  u_palette_secondary — palette color 2
//   vec3  u_palette_tertiary  — palette color 3
//   vec2  u_resolution        — display size in pixels
//   float u_time_ms           — wall-clock milliseconds
//
// Parameters:
//   vec2 uv          — normalized coords (0,0) top-left to (1,1) bottom-right
//   vec2 frag_coord  — raw pixel coords
//   vec4 prev_pixel  — output of the previous shader in a sequence (or black)

vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel) {
  return vec4(u_palette_primary.rgb, 1.0);
}
