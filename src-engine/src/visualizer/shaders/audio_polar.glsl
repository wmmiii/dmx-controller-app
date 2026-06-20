// Audio Polar — 16 frequency bands as polar flares; high frequencies at top,
// low at bottom, symmetric. Inner circle = primary; flares = primary→secondary.

vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel) {
    // Circle-space: r=1 is the full circle radius (= half the shorter canvas side).
    float min_dim = min(u_resolution.x, u_resolution.y);
    vec2 c = (frag_coord - u_resolution * 0.5) / (min_dim * 0.5);
    float r = length(c);

    // Cosine-based angle mapping: 0 at top, 1 at bottom. cos is even so left/right
    // symmetry is automatic. Derivative is sin(theta)/2 which is zero at both poles,
    // giving smooth rounded seams at top and bottom with no kink.
    float theta = atan(c.x, c.y);  // 0 at top (+y), ±PI at bottom
    float t_angle = (1.0 - cos(theta)) / 2.0;

    // Gaussian blur across all bands so neighbouring lobes merge smoothly.
    // band[15] = highest frequency at top; band[0] = lowest at bottom.
    // sigma=2.0 means each sample draws significantly from ~4 surrounding bands.
    float band_f = (1.0 - t_angle) * 15.0;
    float level = 0.0;
    float weight_sum = 0.0;
    for (int i = 0; i < 16; i++) {
        float d = band_f - float(i);
        float w = exp(-d * d * 0.5);  // sigma=2: exponent = -d²/(2·sigma²) = -d²/8
        level += u_audio_bands[i] * w;
        weight_sum += w;
    }
    level /= weight_sum;

    // Radial zones: inner solid disc at r=0.25; flares extend out to r=1.0 at max.
    float inner_r = 0.25;
    float flare_r = inner_r + level * (1.0 - inner_r);

    // Anti-aliased boundaries (~2px in normalised space).
    float aw = 2.0 / min_dim;
    float in_flare = smoothstep(flare_r + aw, flare_r - aw, r);
    float in_inner = smoothstep(inner_r + aw, inner_r - aw, r);

    // Gradient spans the constant 0.25→1.0 range so the color at any radius
    // reflects absolute energy level, not the fraction of the current flare length.
    float t_flare = clamp((r - inner_r) / (1.0 - inner_r), 0.0, 1.0);
    vec3 flare_color = mix(u_palette_primary.rgb, u_palette_secondary.rgb, t_flare);

    // Layer: background → flare gradient → inner primary disc.
    vec3 color = prev_pixel.rgb;
    color = mix(color, flare_color, in_flare);
    color = mix(color, u_palette_primary.rgb, in_inner);

    return vec4(color * u_color.a, 1.0);
}
