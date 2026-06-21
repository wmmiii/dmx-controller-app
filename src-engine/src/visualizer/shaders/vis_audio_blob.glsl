// Audio Blob
// A blob that pulsates to the audio.
// May be used as an effect on its own.
// Place over a black color or a fade effect to avoid color build-up.
vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel) {
    float min_dim = min(u_resolution.x, u_resolution.y);
    vec2 c = (frag_coord - u_resolution.xy * 0.5) / (min_dim * 0.5);
    float r = length(c);

    // Angle from +Y axis (top center). atan(x,y) gives 0 at top, ±π at bottom.
    float theta = atan(c.x, c.y);

    // Map angle to band position: bottom (±π) = band 0, top (0) = band 15
    // Use abs(theta) for horizontal symmetry
    float band_pos = (1.0 - abs(theta) / 3.14159265) * 15.0;

    // Gaussian-weighted sampling with mirrored boundaries for smooth edges
    float sigma = 1.5;
    float level = 0.0;
    float total_weight = 0.0;

    for (int i = -4; i < 20; i++) {
        // Mirror band index at boundaries for smooth falloff
        int band_idx = i;
        if (band_idx < 0) band_idx = -band_idx;
        if (band_idx > 15) band_idx = 30 - band_idx;
        band_idx = clamp(band_idx, 0, 15);

        float dist = float(i) - band_pos;
        float weight = exp(-0.5 * dist * dist / (sigma * sigma));
        level += u_audio_bands[band_idx] * weight;
        total_weight += weight;
    }
    level /= total_weight;

    // Inverse exponential curve: exaggerate quiet sounds, compress loud ones
    float k = 4.0;
    level = (1.0 - exp(-k * level)) / (1.0 - exp(-k));

    float inner_r = 0.25;
    float flare_r = inner_r + level * (1.0 - inner_r);

    // Anti-aliasing width
    float aw = 2.0 / min_dim;
    float in_blob = smoothstep(flare_r + aw, flare_r - aw, r);

    // Fixed gradient from primary (at 0.25) to secondary (at 1.0)
    // When r < inner_r, t_gradient clamps to 0, giving primary color
    float t_gradient = clamp((r - inner_r) / (1.0 - inner_r), 0.0, 1.0);
    vec3 blob_color = mix(u_palette_primary, u_palette_secondary, t_gradient);

    vec3 color = mix(prev_pixel.rgb, blob_color, in_blob);

    return vec4(color, 1.0);
}
