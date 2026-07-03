// Display color
// Used as a base that can be masked by other effects.
vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel) {
  return vec4(u_color, 1.0);
}
