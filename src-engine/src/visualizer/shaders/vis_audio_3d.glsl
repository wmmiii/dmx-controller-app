// Cube
// An effect which renders a rotating cube to a display.
// This visulizer demonstrates advanced rendering techniques such as
// ray-marching a signed-distance-field which may be used to create visualizers.
// Inspired by the great Inigo Quilez.

// The MIT License
// Copyright © 2019 Inigo Quilez
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions: The above copyright
// notice and this permission notice shall be included in all copies or
// substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS",
// WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
// TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
// FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
// TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR
// THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// List of other 3D SDFs: https://www.shadertoy.com/playlist/43cXRl
//
// and https://iquilezles.org/articles/distfunctions

#define time_sec (float(u_time_ms) / 1000.0)

// Box SDF
float sdRoundBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdOctahedron(vec3 p, float s) {
  p = abs(p);
  float m = p.x + p.y + p.z - s;
  vec3 r = 3.0 * p - m;

  vec3 o = min(r, 0.0);
  o = max(r * 2.0 - o * 3.0 + (o.x + o.y + o.z), 0.0);
  return length(p - s * o / (o.x + o.y + o.z));
}

// Smooth minimum
float smin(float a, float b, float k) {
  k *= 6.0;
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * h * k * (1.0 / 6.0);
}

// SDF calculation
float scene(vec3 pos) {
  // Get mean volume
  float avg = 0.0;
  for (int i = 0; i < 16; i++) {
    avg += u_audio_bands[i];
  }
  avg /= 16.0;

  // Smoothing radius
  float rad = 0.04;
  float octSize = 0.1 + avg;
  return smin(sdRoundBox(pos, vec3(0.3)), sdOctahedron(pos, octSize), 0.04) -
  rad;
}

// https://iquilezles.org/articles/normalsSDF
vec3 calcNormal(vec3 pos) {
  vec2 e = vec2(1.0, -1.0) * 0.5773;
  const float eps = 0.0005;
  return normalize(
    e.xyy * scene(pos + e.xyy * eps) +
      e.yyx * scene(pos + e.yyx * eps) +
      e.yxy * scene(pos + e.yxy * eps) +
      e.xxx * scene(pos + e.xxx * eps)
  );
}

#define AA 3 // Anti-aliasing sub-sample count
#define KEY_DIR vec3(0.7, 0.6, 0.4) // Key light direction
#define FILL_DIR vec3(0.0, 0.8, 0.6) // Fill light direction
#define FILL_COL vec3(0.2, 0.3, 0.4) // Fill light color

vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel) {
  // Camera movement
  float an = 0.5 * (time_sec - 10.0);
  vec3 ro = vec3(1.0 * cos(an), 0.6, 1.0 * sin(an));
  vec3 ta = vec3(0.0, 0.0, 0.0);
  // Camera matrix
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = normalize(cross(uu, ww));

  vec3 tot = vec3(0.0);

  #if AA > 1
  for (int m = 0; m < AA; m++)
    for (int n = 0; n < AA; n++) {
      // Pixel coordinates
      vec2 o = vec2(float(m), float(n)) / float(AA) - 0.5;
      vec2 p = (-u_resolution.xy + 2.0 * (frag_coord + o)) / u_resolution.y;
      #else
      vec2 p = (-u_resolution.xy + 2.0 * frag_coord) / u_resolution.y;
      #endif

      // Create view ray
      vec3 rd = normalize(p.x * uu + p.y * vv + 1.5 * ww);

      // Raymarch
      const float tmax = 3.0;
      float t = 0.0;
      for (int i = 0; i < 256; i++) {
        vec3 pos = ro + t * rd;
        float h = scene(pos);
        if (h < 0.0001 || t > tmax) break;
        t += h;
      }

      // Shading/lighting
      vec3 col = vec3(0.0);
      if (t < tmax) {
        vec3 pos = ro + t * rd;
        vec3 nor = calcNormal(pos);
        float key = clamp(dot(nor, KEY_DIR), 0.0, 1.0);
        float fill = 0.5 + 0.5 * dot(nor, FILL_DIR);
        col = u_palette_primary * key + u_palette_secondary * fill;
      }

      // gamma
      col = sqrt(col);
      tot += col;
      #if AA > 1
    }
  tot /= float(AA * AA);
  #endif

  return vec4(tot, 1.0);
}
