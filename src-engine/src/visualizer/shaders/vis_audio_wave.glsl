// Audio Wave
// Visualizes the current waveform.
vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel) {
  // Synthesize wave from frequency bands
  // Sum sine waves where each band controls a harmonic's amplitude
  float wave = 0.0;
  float total_amplitude = 0.0;

  for (int i = 0; i < 16; i++) {
    // Non-harmonic frequency spacing using golden ratio
    float freq = 0.5 + pow(1.618, float(i) * 0.45);

    // Pseudo-random phase offset per band to break standing waves
    float hash = fract(sin(float(i) * 127.1) * 43758.5453);
    float drift_rate = -0.006 - hash * 0.008;
    float phase = hash * 6.28318 + float(u_time_ms) * drift_rate;

    // Amplitude from audio band
    float amp = u_audio_bands[i];
    wave += amp * sin(uv.x * freq * 6.28318 + phase);
    total_amplitude += amp;
  }

  // Normalize and scale to 0-1 range (centered at 0.5)
  wave *= 1.0 - abs(pow(uv.x - 0.5, 2.0) * 4.0);
  float norm = max(total_amplitude, 0.5);
  float wa = 0.5 + wave / norm * 0.35;

  float i = pow(1.0 - abs(uv.y - wa), 20.0);

  // Composite with previous layer
  vec3 final_color = mix(prev_pixel.rgb, u_color, i);

  return vec4(final_color, 1.0);
}
