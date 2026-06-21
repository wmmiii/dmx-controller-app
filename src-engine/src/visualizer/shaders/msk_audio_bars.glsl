// Audio Bars
// 16 audio bars appearing from the bottom of the display.
// May be used as a mask for other effects.
vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel) {
    // Determine which of the 16 bands this pixel belongs to
    int band = int(uv.x * 16.0);
    band = clamp(band, 0, 15);

    // Get the audio level for this band (0.0 to 1.0)
    float level = u_audio_bands[band];

    // Light up pixels below the level threshold
    float lit = step(uv.y, level);

    return vec4(prev_pixel.rgb * lit, 1.0);
}
