// Audio Bars — 16 vertical frequency bars. Bar height follows the matching
// audio band; lit bars use the primary palette color, the background uses the
// secondary palette color.

vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel) {
    int band = int(clamp(uv.x, 0.0, 0.999) * 16.0);
    float level = u_audio_bands[band];
    float lit = step(1.0 - uv.y, level);
    vec3 color = mix(u_palette_secondary.rgb * 0.1, u_palette_primary.rgb, lit);
    return vec4(color * u_color.a, 1.0);
}
