// Plasma
// Psychedelic gradients between the colors of the color palette.
// Used as a base that can be masked by other effects.
vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel) {
  // Convert time from ms to seconds for smoother animation
  float t = float(u_time_ms) * 0.001;
  vec2 p = uv * 8.0;

  // Classic plasma formula with multiple sine waves
  float v = sin(p.x * 1.0 + t * 1.3);
  v += sin(p.y * 0.9 - t * 0.8);
  v += sin((p.x * 0.7 - p.y * 1.1) * 0.6 + t * 1.1);

  // Circular wave centers that move over time
  vec2 c1 = vec2(3.5 + 1.5 * sin(t * 0.53), 3.5 + 1.5 * cos(t * 0.71));
  vec2 c2 = vec2(4.5 + 1.5 * cos(t * 0.37), 4.5 + 1.5 * sin(t * 0.61));
  v += sin(length(p - c1) * 0.9 - t * 0.9);
  v += sin(length(p - c2) * 0.7 + t * 1.2);

  // Normalize to 0-1 range
  v = v * 0.2 + 0.5;

  // Map plasma value across the three palette colors
  vec3 color;
  if (v < 0.5) {
    color = mix(u_palette_secondary, u_palette_primary, v * 2.0);
  } else {
    float t = (v - 0.5) * 2.0;
    color = mix(u_palette_primary, u_palette_tertiary, t * 0.6);
  }

  return vec4(color, 1.0);
}
