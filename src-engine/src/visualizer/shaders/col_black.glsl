// Black
// Used as a base that can be used as the bottom of a visualizer stack to
// prevent persistence effects.
vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel) {
  return vec4(vec3(0.0), 1.0);
}
