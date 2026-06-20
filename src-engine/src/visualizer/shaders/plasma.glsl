// Plasma — classic animated plasma effect. The scalar plasma field is mapped
// across the primary/secondary/tertiary palette colors.

vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel) {
    float t = u_time * 0.0005;
    vec2 p = uv * 8.0;

    // Each term has a distinct speed and direction so the field stays active
    // across the whole canvas rather than translating in one direction.
    float v = sin(p.x * 1.0 + t * 1.3);
    v += sin(p.y * 0.9 - t * 0.8);
    v += sin((p.x * 0.7 - p.y * 1.1) * 0.6 + t * 1.1);
    // Two radial centers at different positions, drifting at different rates.
    vec2 c1 = vec2(3.5 + 1.5 * sin(t * 0.53), 3.5 + 1.5 * cos(t * 0.71));
    vec2 c2 = vec2(4.5 + 1.5 * cos(t * 0.37), 4.5 + 1.5 * sin(t * 0.61));
    v += sin(length(p - c1) * 0.9 - t * 0.9);
    v += sin(length(p - c2) * 0.7 + t * 1.2);
    v = v * 0.2 + 0.5; // normalize five terms to 0..1

    // Map the field across the three palette colors.
    vec3 color;
    if (v < 0.5) {
        color = mix(u_palette_primary.rgb, u_palette_secondary.rgb, v * 2.0);
    } else {
        color = mix(u_palette_secondary.rgb, u_palette_tertiary.rgb, (v - 0.5) * 2.0);
    }
    return vec4(color * u_color.a, 1.0);
}
