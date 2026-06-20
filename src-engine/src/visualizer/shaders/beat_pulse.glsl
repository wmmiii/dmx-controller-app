// Beat Pulse — a radial pulse that expands from the center on each beat. The
// pulse brightness follows the beat phase (u_beat_t goes 0 -> 1 each beat).

vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel) {
    vec2 centered = uv - 0.5;
    float dist = length(centered);
    // Pulse fades out over the beat and is brightest at the start of the beat.
    float pulse = 1.0 - u_beat_t;
    float ring = smoothstep(0.5 * u_beat_t + 0.05, 0.5 * u_beat_t, dist);
    vec3 color = u_palette_primary.rgb * ring * pulse;
    return vec4(color * u_color.a, 1.0);
}
