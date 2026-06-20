// Rainbow Gradient — HSV color cycle across the display, modulated by the
// primary palette color and animated over time.

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel) {
    float hue = fract(uv.x + u_time * 0.0001);
    vec3 rainbow = hsv2rgb(vec3(hue, 1.0, 1.0));
    return vec4(rainbow * u_color.a, 1.0);
}
