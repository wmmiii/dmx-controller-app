// Plasma — classic animated plasma effect. The scalar plasma field is mapped
// across the primary/secondary/tertiary palette colors.

vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel) {
    float t = u_time * 0.0005;
    vec2 p = uv * 8.0;
    float v = sin(p.x + t);
    v += sin(p.y + t);
    v += sin((p.x + p.y) * 0.5 + t);
    v += sin(length(p - 4.0) + t);
    v = v * 0.25 + 0.5; // normalize to 0..1

    // Map the field across the three palette colors.
    vec3 color;
    if (v < 0.5) {
        color = mix(u_palette_primary.rgb, u_palette_secondary.rgb, v * 2.0);
    } else {
        color = mix(u_palette_secondary.rgb, u_palette_tertiary.rgb, (v - 0.5) * 2.0);
    }
    return vec4(color * u_color.a, 1.0);
}
