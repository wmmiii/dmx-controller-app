// Vignette — smoothly fades the edges of the previous shader's output to
// black, using a radial falloff centered on the UV midpoint.

vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel) {
    float dist = length(uv - 0.5);
    float vignette = smoothstep(0.5, 0.2, dist);
    return vec4(prev_pixel.rgb * vignette, prev_pixel.a);
}
