// Beat Pulse
// A glowing pulse that expands from the center on each beat.
// May be used as a mask for other effects.
vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel) {
  vec2 centered =
    (frag_coord - u_resolution.xy / 2.0) / min(u_resolution.x, u_resolution.y);
  float dist = length(centered) / 0.5;

  // u_beat_t is 0-1 position within beat. Add epsilon to avoid division by zero
  // in smoothstep when exactly on a beat.
  float beat = max(u_beat_t, 0.001);

  // Central glow that expands with the beat
  float glow = smoothstep(beat, 0.0, dist);

  // Falloff over beat.
  glow *= 1.0 - beat;

  return vec4(glow * prev_pixel.rgb, 1.0);
}
