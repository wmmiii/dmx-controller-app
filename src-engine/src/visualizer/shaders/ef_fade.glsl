// Fade effect
// Can be used before any other effects in a stack to fade out the last frame to
// black.
vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel) {
  return vec4(prev_pixel.rgb * 0.8, 1.0);
}
