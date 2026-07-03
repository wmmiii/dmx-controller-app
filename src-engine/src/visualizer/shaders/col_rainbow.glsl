// Rainbow
// Rotating and sliding rainbow gradient.
// Used as a base that can be masked by other effects.
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel) {
  // Convert time from ms to seconds, then slow it down for smooth animation
  float t = float(u_time_ms) * 0.0001;

  // Rotate UV coordinates around center
  vec2 centered = uv - 0.5;
  float rotation_speed = 1.234;
  float angle = t * rotation_speed;
  float c = cos(angle);
  float s = sin(angle);
  vec2 rotated = vec2(
    centered.x * c - centered.y * s,
    centered.x * s + centered.y * c
  );

  // Hue cycles across x-axis and shifts over time
  float hue = fract(rotated.x + 0.5 + t);

  // Full saturation and value for vivid rainbow
  vec3 rainbow = hsv2rgb(vec3(hue, 1.0, 1.0));

  // Modulate with the primary color for tinting
  vec3 color = rainbow * mix(vec3(1.0), u_color, 0.3);

  return vec4(color, 1.0);
}
