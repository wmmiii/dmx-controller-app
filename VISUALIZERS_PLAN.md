# GLSL Shader Visualizers Implementation Plan

Add GLSL shader-based "Visualizers" that render on displays, with a code editor in the Patch page and GPU-accelerated execution via wgpu.

## Overview

- **Visualizers Tab**: New tab in PatchPage for managing GLSL shaders
- **Code Editor**: Monaco Editor (lazy-loaded) with GLSL syntax highlighting
- **Shader Execution**: wgpu + naga for GPU rendering in Rust
- **Visualizer Tree**: Effects build a tree structure for composing visualizers:
  - **Leaf**: Single shader ID (uniforms computed once from final display state)
  - **Sequence**: Chain shaders (output of A → input of B)
  - **Lerp**: Blend two subtrees pixel-by-pixel (tile amounts baked into `t` values)
  - **BlackBuffer**: Constant black texture for fade in/out
- **Tile Composition**: Active tiles are combined via Lerp nodes with tile amounts baked into `t` values. Once the tree is built, no reference back to tiles is needed.
- **Uniform Consistency**: All shaders in the tree receive the same uniforms (color, dimmer, palette, etc.) computed from the final interpolated DisplayRenderTarget state
- **GPU-Side Rendering**: All intermediate textures (RGBA8Unorm) stay on GPU; only ONE CPU readback at the end for DDP output
- **Built-in Visualizers**: Read-only shaders baked into app; users can copy to edit
- **Error Handling**: Show black if shader compilation fails or errors occur during rendering
- **Code Reuse for Frontend Preview**: Shareable logic in `src-engine/`, GPU-specific code separate; enables future WebGL preview in browser (buffer passing from Rust is too slow for live preview)

---

## Phase 0: iOS Compatibility Spike ✅ COMPLETE

Verify wgpu works on iOS before committing to this architecture. This is a minimal test to confirm Metal backend initialization.

**Goal**: Confirm wgpu can initialize headless on iOS and create GPU textures. This must pass before proceeding with other phases.

**Result**: ✅ **PASSED**. wgpu initializes headless on the iOS simulator with `Backend: Metal`. Desktop (macOS Metal) also passes. The architecture is viable; proceed with later phases.

**Adjustments made during the spike (apply these in later phases):**

- **wgpu 26 API differs from the snippets below.** `request_adapter` returns a `Result` (not `Option`), so use `.map_err(...)?` instead of `.ok_or(...)?`. `request_device` takes a single `&DeviceDescriptor` argument (the trailing `None` trace parameter was removed). See the actual working code in `src-tauri/src/shader_spike.rs`.
- **`wasm:build` is now a prerequisite of `pnpm dev`.** The `dev` script was updated to `proto:generate && wasm:build && vite` so `tauri:dev`/`tauri:ios` (which run `pnpm dev` via `beforeDevCommand`) build the WASM engine before Vite starts. Requires `wasm-pack` and the `wasm32-unknown-unknown` target installed locally.
- **Mobile serial stub gained `try_close_port`.** The `#[cfg(mobile)]` `SerialState` no-op stub in `src-tauri/src/lib.rs` now also stubs `try_close_port` (matching the existing stub pattern), since `output_loop.rs` calls it ungated. Stubbing — not `#[cfg]` gating the call site — is the chosen approach for serial-on-iOS.

---

### 0.1 Add wgpu dependency

Add to `src-tauri/Cargo.toml` in the `[dependencies]` section:

```toml
wgpu = { version = "26.0", default-features = false, features = ["metal", "wgsl"] }
```

**Note**: We use `default-features = false` with explicit `metal` to ensure iOS compatibility. The `wgsl` feature is needed for shader compilation in later phases.

---

### 0.2 Create `src-tauri/src/shader_spike.rs`

Create a new file with the following contents:

```rust
/// Minimal wgpu initialization test for iOS compatibility verification.
/// This module can be removed after Phase 0 is complete.

pub async fn test_wgpu_init() -> Result<String, String> {
    // Request adapter with no surface (headless rendering)
    let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
        backends: wgpu::Backends::all(),
        ..Default::default()
    });

    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: None, // Headless - no window surface
            force_fallback_adapter: false,
        })
        .await
        // wgpu 26: request_adapter returns Result, not Option.
        .map_err(|e| format!("No GPU adapter found: {e}"))?;

    let (device, _queue) = adapter
        // wgpu 26: request_device takes a single &DeviceDescriptor (no trace arg).
        .request_device(&wgpu::DeviceDescriptor::default())
        .await
        .map_err(|e| format!("Device request failed: {e}"))?;

    // Create a small test texture to verify GPU memory allocation works
    let _texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("test_texture"),
        size: wgpu::Extent3d {
            width: 64,
            height: 64,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });

    let info = adapter.get_info();
    Ok(format!(
        "SUCCESS: wgpu initialized!\nAdapter: {}\nBackend: {:?}\nDriver: {}",
        info.name, info.backend, info.driver
    ))
}

#[tauri::command]
pub async fn test_shader_spike() -> Result<String, String> {
    test_wgpu_init().await
}
```

---

### 0.3 Register the module and command

**In `src-tauri/src/lib.rs`:**

1. Add the module declaration near the top with other modules:

```rust
mod shader_spike;
```

2. Add the command to `invoke_handler`. Find the `invoke_handler(tauri::generate_handler![...])` block and add:

```rust
shader_spike::test_shader_spike,
```

---

### 0.4 Create frontend test button

**Create `src/components/ShaderSpikeTest.tsx`:**

```tsx
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';

export function ShaderSpikeTest() {
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runTest = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const response = await invoke<string>('test_shader_spike');
      setResult(response);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h2>wgpu iOS Compatibility Test</h2>
      <button onClick={runTest} disabled={loading}>
        {loading ? 'Testing...' : 'Run wgpu Test'}
      </button>
      {result && (
        <pre
          style={{ color: 'green', marginTop: '10px', whiteSpace: 'pre-wrap' }}
        >
          {result}
        </pre>
      )}
      {error && (
        <pre
          style={{ color: 'red', marginTop: '10px', whiteSpace: 'pre-wrap' }}
        >
          ERROR: {error}
        </pre>
      )}
    </div>
  );
}
```

**Add to a page temporarily for testing.** In `src/pages/patch/PatchPage.tsx`, add a temporary tab:

```tsx
import { ShaderSpikeTest } from '../../components/ShaderSpikeTest';

// In the tabs object:
['spike']: { name: 'GPU Test', contents: <ShaderSpikeTest /> },
```

---

### 0.5 Build and test on desktop first

Before iOS, verify it works on desktop:

```bash
pnpm run tauri:dev
```

1. Navigate to Patch page
2. Click "GPU Test" tab
3. Click "Run wgpu Test" button
4. **Expected output** (macOS):
   ```
   SUCCESS: wgpu initialized!
   Adapter: Apple M1 (or similar)
   Backend: Metal
   Driver: Metal driver info
   ```
5. **Expected output** (Linux):
   ```
   SUCCESS: wgpu initialized!
   Adapter: NVIDIA GeForce... (or similar)
   Backend: Vulkan
   Driver: ...
   ```

If desktop fails, fix issues before proceeding to iOS.

---

### 0.6 Test on iOS simulator

```bash
pnpm run tauri:ios
```

This should launch the iPad Pro 13-inch M5 simulator. Once the app loads:

1. Navigate to the Patch page
2. Tap the "GPU Test" tab
3. Tap "Run wgpu Test" button
4. **Check the result displayed on screen**

**Expected success output:**

```
SUCCESS: wgpu initialized!
Adapter: Apple GPU (or Apple iOS Simulator GPU)
Backend: Metal
Driver: Metal driver info
```

**Possible failure outputs:**

- `"No GPU adapter found"` - wgpu cannot find Metal adapter
- `"Device request failed: ..."` - Device creation failed
- App crash - Check Xcode console for Metal errors

---

### 0.7 Check Xcode console for additional info

If testing via Xcode (or if the app crashes):

1. Open the project in Xcode: `open src-tauri/gen/apple/dmx_controller_app.xcodeproj`
2. Run on simulator from Xcode
3. Check the console output for:
   - Metal initialization messages
   - Any GPU-related errors
   - Rust panic messages (if crash)

---

### 0.8 Success criteria checklist

Run through this checklist and mark items complete:

- [x] **Desktop build succeeds**: `pnpm run tauri:dev` compiles without errors
- [x] **Desktop test passes**: Button click shows "SUCCESS" with Metal (macOS) or Vulkan (Linux) backend
- [x] **iOS build succeeds**: `pnpm run tauri:ios` compiles and launches simulator
- [x] **iOS test passes**: Button click shows "SUCCESS" with Metal backend
- [x] **No crashes**: App remains stable after test
- [x] **Texture creation works**: The success message appears (texture creation is part of the test)

**If ALL items pass**: Phase 0 is complete. Proceed to Phase 1.

**If iOS fails but desktop passes**: Document the error and try alternatives below.

---

### 0.9 Troubleshooting / alternatives if iOS fails

**Issue: "No GPU adapter found"**

Try requesting a low-power adapter instead:

```rust
power_preference: wgpu::PowerPreference::LowPower,
```

**Issue: Headless not supported**

iOS may require a surface. Try creating a hidden CAMetalLayer:

1. This requires Objective-C/Swift bridging
2. Consider falling back to CPU rendering on iOS

**Issue: Simulator limitations**

The iOS Simulator uses a software Metal implementation. Try on a real device if possible.

**Fallback decision**: If wgpu doesn't work on iOS after investigation:

- Visualizer rendering can be desktop-only (iOS shows static color from display state)
- Document this limitation and proceed with desktop implementation

---

### 0.10 Cleanup after Phase 0

Once Phase 0 passes and you proceed to later phases:

1. Remove `src/components/ShaderSpikeTest.tsx`
2. Remove the temporary "GPU Test" tab from `PatchPage.tsx`
3. Keep `src-tauri/src/shader_spike.rs` - it will evolve into `shader.rs` in Phase 2
4. Or delete `shader_spike.rs` and start fresh with `shader.rs`

---

## Shader Function Signature

Users write a `visualizer()` function, not `main()`. The system wraps it with boilerplate:

**User writes:**

```glsl
vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel) {
    // uv         = normalized screen coords (gl_FragCoord.xy / u_resolution)
    // frag_coord = raw pixel coords (gl_FragCoord.xy)
    // prev_pixel = output from previous shader in sequence (or black)
    vec3 color = u_palette_primary.rgb * u_audio_bands[0];
    return vec4(color, 1.0);
}
```

**System generates:**

```glsl
#version 450

layout(set = 0, binding = 0) uniform Uniforms {
    vec4 u_color;
    float u_audio_bands[16];
    float u_beat_t;
    float _pad1[3];
    vec4 u_palette_primary;
    vec4 u_palette_secondary;
    vec4 u_palette_tertiary;
    vec2 u_resolution;
    float u_time;
    float _pad2;
};

layout(set = 0, binding = 1) uniform texture2D t_previous;
layout(set = 0, binding = 2) uniform sampler s_previous;

layout(location = 0) out vec4 fragColor;

// USER CODE INJECTED HERE

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    vec4 prev = texture(sampler2D(t_previous, s_previous), uv);
    fragColor = visualizer(uv, gl_FragCoord.xy, prev);
}
```

## Uniforms Exposed to Shaders

```glsl
vec4 u_color;              // Display color RGB + dimmer
float u_audio_bands[16];   // Audio frequency bands (0.0-1.0)
float u_beat_t;            // Beat phase (0.0-1.0)
vec4 u_palette_primary;    // Palette color 1
vec4 u_palette_secondary;  // Palette color 2
vec4 u_palette_tertiary;   // Palette color 3
vec2 u_resolution;         // Display width, height
float u_time;              // Milliseconds since start
```

---

## Code Architecture (Reuse for Frontend Preview)

To enable future WebGL-based preview in the browser during shader authoring, shareable logic lives in `src-engine/` while GPU-specific rendering stays in `src-tauri/`.

**Note**: Passing rendered buffers from Rust to frontend is too slow for live preview. Frontend preview must render directly via WebGL.

### Shareable (in `src-engine/`)

```
src-engine/src/visualizer/
├── mod.rs
├── tree.rs           # build_visualizer_tree(), tree traversal logic
├── shader_wrap.rs    # wrap_user_shader(), GLSL boilerplate generation
├── uniforms.rs       # ShaderUniforms struct definition
└── builtin.rs        # BUILTIN_VISUALIZERS with GLSL source strings
```

These modules contain:

- Pure data structures and logic (no GPU calls)
- GLSL source strings (same shaders work in wgpu and WebGL)
- Shader wrapping/boilerplate (string manipulation)
- Tree building algorithm

### Platform-Specific

| Location                  | Purpose              | API               |
| ------------------------- | -------------------- | ----------------- |
| `src-tauri/src/shader.rs` | Production rendering | wgpu (native GPU) |
| Future: `src/rendering/`  | Live preview         | WebGL2 (browser)  |

Both implementations use the same:

- Tree structure from `src-engine/visualizer/tree.rs`
- Shader source strings from `src-engine/visualizer/builtin.rs`
- Wrapped GLSL from `src-engine/visualizer/shader_wrap.rs`
- Uniform definitions from `src-engine/visualizer/uniforms.rs`

### Swapping naga for glslang (if needed)

If naga's GLSL support proves too limited, swapping to glslang is moderate effort (~50-100 lines):

1. Replace `naga::front::glsl::Frontend` with `shaderc` crate
2. glslang outputs SPIR-V directly, which wgpu consumes via `wgpu::ShaderSource::SpirV`
3. Rest of pipeline (bind groups, render passes) stays the same

---

## Phase 1: Proto Schema Changes ✅ COMPLETE

**Result**: ✅ Done. `proto/visualizer.proto` created; `display.proto`, `project.proto`, `effect.proto` updated; TS bindings regenerated and Rust `build.rs` auto-compiles the new proto. Both `cargo check` (src-engine) and `pnpm run type-check` pass. Note: `src-engine/src/render/render.rs` required adding `visualizer_tree: None` to its `DisplayRenderTarget` literal.

### 1.1 Create `proto/visualizer.proto`

```protobuf
syntax = "proto3";
package dmx_controller;

// Stored shader definition
message Visualizer {
  uint64 id = 1;
  string name = 2;
  string glsl_source = 3;
  bool is_builtin = 4;  // Read-only in UI
}

// Compilation result returned from Tauri command
message VisualizerCompilationResult {
  bool success = 1;
  string error_message = 2;
  uint32 error_line = 3;
}

// Tree node for composing visualizers at render time
// Note: Uniforms are NOT stored per-node; they're computed once from
// the final DisplayRenderTarget state and passed to all shader renders.
// Tile amounts are baked into Lerp.t values during tree construction.
message VisualizerNode {
  oneof node {
    uint64 leaf = 1;                 // Shader ID (renders with shared uniforms)
    VisualizerLerp lerp = 2;         // Blend two subtrees
    VisualizerSequence sequence = 3; // Chain shaders
    bool black_buffer = 4;           // Constant black (value ignored, presence matters)
  }
}

// Lerp: render both subtrees, blend pixels
// t values include baked tile amounts for composition
message VisualizerLerp {
  VisualizerNode a = 1;
  VisualizerNode b = 2;
  float t = 3;  // 0.0 = fully A, 1.0 = fully B
}

// Sequence: chain shaders, output of each becomes input to next
// Used when an effect defines multiple visualizers
message VisualizerSequence {
  repeated VisualizerNode nodes = 1;
}
```

### 1.2 Modify `proto/display.proto`

Add to `DisplayRenderTarget`:

```protobuf
VisualizerNode visualizer_tree = 4;  // Tree of visualizers to render
```

### 1.3 Modify `proto/project.proto`

Add to `Project`:

```protobuf
map<uint64, Visualizer> visualizers = 63;
```

### 1.4 Modify `proto/effect.proto`

Add to `FixtureState`:

```protobuf
repeated uint64 visualizer_ids = 17;  // Chain of visualizers (sequence within this effect)
```

Note: Multiple IDs in a single effect state form a Sequence. Interpolation between effect states (e.g., ramp effects) uses Lerp per-fragment.

### 1.5 Run proto generation

```bash
pnpm run proto:generate
```

---

## Phase 2: Rust Engine - Shader Infrastructure ✅ COMPLETE

**Result**: ✅ Done. Shareable modules created under `src-engine/src/visualizer/` (`mod.rs`, `uniforms.rs`, `shader_wrap.rs`, `builtin.rs`, `shaders/*.glsl`); GPU rendering in `src-tauri/src/shader.rs`. Both desktop and `aarch64-apple-ios-sim` targets `cargo check` clean.

**Adjustments vs. the snippets below:**

- **`naga` has no `validate` feature** — validation is always available. Removed it from both dep blocks.
- **`ShaderSource::Naga` is feature-gated** (`naga-ir`). Rather than enable it, we validate the parsed module with naga (for line-numbered errors) and then hand the wrapped GLSL to wgpu via `ShaderSource::Glsl`, which re-parses it.
- **Vertex + blend shaders are WGSL**, not GLSL. A no-vertex-buffer fullscreen triangle (positions from `vertex_index`) replaces the planned vertex buffer / fullscreen quad. The blend shader is WGSL (`BLEND_WGSL`) instead of the GLSL snippet below.
- **Black texture is 1x1** (only ever sampled, never a render target). An empty/black tree result returns a CPU-side zero buffer directly rather than reading back the 1x1 texture.
- **No `RwLock` render lock** — `ShaderState` lives behind a `Mutex` in app state, so renders and deletions are already serialized. `mark_for_deletion` queues IDs flushed at the end of `render_and_readback`.
- **`shader.rs` carried a temporary `#![allow(dead_code)]`** during Phase 2; removed in Phase 3 once `display_loop` + Tauri commands consumed it.
- The render helpers (`render_shader`, `blend_textures`) are associated functions taking explicit `&Device`/`&Queue`/view refs (not `&self` methods) so the recursive `render_tree(&mut self, …)` can borrow pool fields disjointly.

### 2.1 Add dependencies to `src-tauri/Cargo.toml`

```toml
[dependencies]
bytemuck = { version = "1.21", features = ["derive"] }

[target.'cfg(target_os = "ios")'.dependencies]
wgpu = { version = "26.0", default-features = false, features = ["metal", "wgsl", "glsl"] }
naga = { version = "26.0", default-features = false, features = ["glsl-in", "spv-out"] }

[target.'cfg(not(target_os = "ios"))'.dependencies]
wgpu = { version = "26.0", features = ["vulkan", "metal", "wgsl", "glsl"] }
naga = { version = "26.0", features = ["glsl-in", "spv-out"] }
```

### 2.2 Create `src-tauri/src/shader.rs`

**ShaderState struct**:

- `device: wgpu::Device`, `queue: wgpu::Queue`
- `compiled_shaders: HashMap<u64, CompiledShader>`
- `vertex_buffer: wgpu::Buffer` (fullscreen quad)
- `texture_pool: TexturePool` - Dynamic pool of RGBA8Unorm textures
- `blend_pipeline: wgpu::RenderPipeline` - Built-in blend shader for Lerp nodes
- `black_texture: wgpu::Texture` - Constant black RGBA8Unorm texture
- `pending_deletions: Vec<u64>` - Shaders to delete after render completes
- `render_lock: RwLock<()>` - Prevents deletion during active render

**TexturePool** (dynamic sizing):

```rust
struct TexturePool {
    textures: Vec<wgpu::Texture>,
    in_use: Vec<bool>,
    width: u32,
    height: u32,
}

impl TexturePool {
    fn acquire(&mut self, device: &wgpu::Device) -> usize {
        // Find free texture or grow pool
        if let Some(idx) = self.in_use.iter().position(|&used| !used) {
            self.in_use[idx] = true;
            return idx;
        }
        // Grow pool dynamically
        let tex = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("pool_texture"),
            size: wgpu::Extent3d {
                width: self.width,
                height: self.height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        self.textures.push(tex);
        self.in_use.push(true);
        self.textures.len() - 1
    }

    fn release(&mut self, idx: usize) {
        self.in_use[idx] = false;
    }

    fn release_all(&mut self) {
        self.in_use.fill(false);
    }
}
```

**Key methods**:

- `new() -> Result<Self>` - Initialize wgpu headless (no surface)
- `compile_shader(id, glsl) -> Result<(), ShaderCompilationError>` - Parse GLSL via naga, validate, create pipeline
- `render_tree(node, uniforms, prev_idx) -> usize` - Recursively render tree, returns texture pool index
- `render_and_readback(tree, uniforms) -> Vec<u8>` - Render tree then ONE CPU readback for DDP output
- `mark_for_deletion(id)` - Queue shader for deletion (happens after render completes)
- `flush_deletions()` - Called after render, removes pending shaders from cache

**GPU-side rendering (no intermediate CPU readback)**:

All tree rendering uses RGBA8Unorm textures on GPU. The blend operation uses a built-in shader:

```glsl
#version 450

layout(set = 0, binding = 0) uniform BlendUniforms {
    float u_t;
};

layout(set = 0, binding = 1) uniform texture2D t_a;
layout(set = 0, binding = 2) uniform texture2D t_b;
layout(set = 0, binding = 3) uniform sampler s_linear;

layout(location = 0) out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / vec2(textureSize(sampler2D(t_a, s_linear), 0));
    vec4 a = texture(sampler2D(t_a, s_linear), uv);
    vec4 b = texture(sampler2D(t_b, s_linear), uv);
    fragColor = mix(a, b, u_t);
}
```

**Tree rendering algorithm**:

```rust
impl ShaderState {
    /// Render entire tree, return texture pool index of result
    fn render_tree(
        &mut self,
        node: &VisualizerNode,
        uniforms: &ShaderUniforms,
        prev_idx: usize,  // Texture index for "previous" input
    ) -> usize {
        match &node.node {
            Some(Node::Leaf(shader_id)) => {
                match self.compiled_shaders.get(shader_id) {
                    Some(shader) => {
                        let out_idx = self.texture_pool.acquire(&self.device);
                        self.render_shader(shader, uniforms, prev_idx, out_idx);
                        out_idx
                    }
                    None => {
                        // Shader not found or failed to compile - return black
                        self.black_texture_idx
                    }
                }
            }

            Some(Node::BlackBuffer(_)) => {
                self.black_texture_idx
            }

            Some(Node::Sequence(seq)) => {
                let mut buffer_idx = prev_idx;
                for child in &seq.nodes {
                    let new_idx = self.render_tree(child, uniforms, buffer_idx);
                    if buffer_idx != prev_idx && buffer_idx != self.black_texture_idx {
                        self.texture_pool.release(buffer_idx);
                    }
                    buffer_idx = new_idx;
                }
                buffer_idx
            }

            Some(Node::Lerp(lerp)) => {
                let idx_a = self.render_tree(
                    lerp.a.as_ref().unwrap_or(&BLACK_NODE),
                    uniforms,
                    prev_idx,
                );
                let idx_b = self.render_tree(
                    lerp.b.as_ref().unwrap_or(&BLACK_NODE),
                    uniforms,
                    prev_idx,
                );
                let out_idx = self.texture_pool.acquire(&self.device);
                self.blend_textures(idx_a, idx_b, lerp.t, out_idx);

                // Release intermediate textures
                if idx_a != prev_idx && idx_a != self.black_texture_idx {
                    self.texture_pool.release(idx_a);
                }
                if idx_b != prev_idx && idx_b != self.black_texture_idx {
                    self.texture_pool.release(idx_b);
                }
                out_idx
            }

            None => self.black_texture_idx,
        }
    }

    /// Full render with cleanup
    fn render_and_readback(&mut self, tree: &VisualizerNode, uniforms: &ShaderUniforms) -> Vec<u8> {
        let _guard = self.render_lock.write().unwrap();

        self.texture_pool.release_all();
        let result_idx = self.render_tree(tree, uniforms, self.black_texture_idx);
        let pixels = self.readback_texture(result_idx);

        // Flush pending deletions now that render is complete
        for id in self.pending_deletions.drain(..) {
            self.compiled_shaders.remove(&id);
        }

        pixels
    }
}

const BLACK_NODE: VisualizerNode = VisualizerNode {
    node: Some(Node::BlackBuffer(true)),
};
```

**Uniform buffer structure** (bind group):

```rust
#[repr(C)]
#[derive(Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
struct ShaderUniforms {
    color: [f32; 4],           // 16 bytes
    audio_bands: [f32; 16],    // 64 bytes
    beat_t: f32,               // 4 bytes
    _pad1: [f32; 3],           // 12 bytes (align to 16)
    palette_primary: [f32; 4], // 16 bytes
    palette_secondary: [f32; 4], // 16 bytes
    palette_tertiary: [f32; 4],  // 16 bytes
    resolution: [f32; 2],      // 8 bytes
    time: f32,                 // 4 bytes
    _pad2: f32,                // 4 bytes (align to 16)
}
// Total: 160 bytes, 16-byte aligned
```

### 2.3 Create `src-engine/src/visualizer/builtin.rs`

```rust
pub struct BuiltinVisualizer {
    pub id: u64,
    pub name: &'static str,
    pub glsl_source: &'static str,
}

pub const BUILTIN_VISUALIZERS: &[BuiltinVisualizer] = &[
    BuiltinVisualizer {
        id: 1,
        name: "Rainbow Gradient",
        glsl_source: include_str!("shaders/rainbow.glsl"),
    },
    BuiltinVisualizer {
        id: 2,
        name: "Audio Bars",
        glsl_source: include_str!("shaders/audio_bars.glsl"),
    },
    BuiltinVisualizer {
        id: 3,
        name: "Beat Pulse",
        glsl_source: include_str!("shaders/beat_pulse.glsl"),
    },
    BuiltinVisualizer {
        id: 4,
        name: "Plasma",
        glsl_source: include_str!("shaders/plasma.glsl"),
    },
];

/// IDs 1-999 are reserved for built-in visualizers
pub const BUILTIN_ID_RANGE: std::ops::Range<u64> = 1..1000;

pub fn is_builtin(id: u64) -> bool {
    BUILTIN_ID_RANGE.contains(&id)
}
```

### 2.4 Create `src-engine/src/visualizer/shaders/` directory

Create 4 built-in GLSL shaders demonstrating different features:

- `rainbow.glsl` - HSV color cycling with palette modulation
- `audio_bars.glsl` - Frequency band visualization
- `beat_pulse.glsl` - Beat-reactive pulsing
- `plasma.glsl` - Classic plasma effect with palette colors

Each shader is a `visualizer()` function only (no main, no uniforms declared).

---

## Phase 3: Rust Engine - Integration ✅ COMPLETE

**Status:** Implemented and verified. `cargo check` passes for both desktop and `aarch64-apple-ios-sim`; the 9 `visualizer::tree` unit tests pass. The original design below is kept for reference; actual deviations are noted here.

**Adjustments:**

- **Uniforms are built in the engine, not the Tauri layer.** Rather than gathering audio/beat/palette inside `display_loop.rs` (steps 3.3.1–3.3.4), a new `pub fn render_display_target(display_id, system_t, frame) -> Result<DisplayRenderData>` in `src-engine/src/render/render.rs` does it all under the project lock. `DisplayRenderData` is now `pub` with public fields and carries a fully-built `ShaderUniforms` (`shader_uniforms`). Helpers `build_shader_uniforms` and `palette_rgba` live alongside it. This keeps all project-state access in one place and minimizes lock time. `render_display` was reduced to a thin CPU-fallback wrapper over `render_display_target`.
- **`ShaderUniforms.time` is wall-clock ms wrapped modulo one day.** `system_t` (unix ms) can't fit an f32 without ~256ms quantization, so it's stored as `(system_t % 86_400_000) as f32`. f32 (not u64) because the value is a GPU uniform consumed by GLSL, where 64-bit ints aren't portable. The modulo keeps full ms precision and wall-clock phase alignment.
- **Palette comes from the active scene's `active_color_palette`** (no transition lerp baked into uniforms), falling back to `DEFAULT_COLOR_PALETTE`.
- **CPU fallback path retained.** `src/render/shaders.rs` was made `pub mod` so `display_loop.rs` can call `render_display_shaders` directly for displays with no visualizer tree (or when GPU init failed). `render_display_buffer` / `rgba8_to_display_buffer` helpers in `display_loop.rs` route per-display between the GPU readback and the CPU renderer. GPU readback runs inside `tokio::task::block_in_place`.
- **Built-ins are compiled at GPU init.** `ShaderState::new()` compiles every `BUILTIN_VISUALIZERS` entry up front so leaf nodes referencing reserved IDs (1–999) render immediately; errors are logged, not fatal.
- **GPU init is non-fatal.** `lib.rs` manages `Arc<std::sync::Mutex<ShaderState>>` only if `ShaderState::new()` succeeds; on failure it logs and every display uses the CPU fallback (state simply absent from `try_state`).
- **Tauri commands return prost-encoded bytes, not typed structs.** `compile_visualizer` returns `Vec<u8>` (encoded `VisualizerCompilationResult`); `get_builtin_visualizers` returns `Vec<Vec<u8>>` (encoded `Visualizer`s); `delete_visualizer` returns `()`. This matches how the rest of the IPC boundary passes protobufs. They use a blocking `std::sync::Mutex`, not async.
- **`#![allow(dead_code)]` removed from `shader.rs`** now that everything is wired.
- **`time` semantics note** in `uniforms.rs` updated to "wall-clock ms wrapped modulo one day".

### 3.1 Create `src-engine/src/visualizer/tree.rs`

Tree building with tile amounts baked into Lerp.t values:

```rust
use crate::proto::{VisualizerNode, VisualizerLerp, VisualizerSequence};

/// Build tree for a single effect state's visualizers (forms a Sequence)
pub fn build_effect_visualizer_tree(visualizer_ids: &[u64]) -> Option<VisualizerNode> {
    match visualizer_ids.len() {
        0 => None,
        1 => Some(VisualizerNode::leaf(visualizer_ids[0])),
        _ => Some(VisualizerNode::sequence(
            visualizer_ids.iter().map(|&id| VisualizerNode::leaf(id)).collect()
        )),
    }
}

/// Build tree for interpolating between two effect states (Lerp)
/// Used for ramp effects, crossfades, etc.
pub fn build_interpolated_tree(
    state_a: Option<VisualizerNode>,
    state_b: Option<VisualizerNode>,
    t: f32,
) -> Option<VisualizerNode> {
    match (state_a, state_b) {
        (None, None) => None,

        (Some(a), None) => {
            // Fading out to black
            Some(VisualizerNode::lerp(a, VisualizerNode::black(), t))
        }

        (None, Some(b)) => {
            // Fading in from black
            Some(VisualizerNode::lerp(VisualizerNode::black(), b, t))
        }

        (Some(a), Some(b)) if trees_equal(&a, &b) => {
            // Same tree structure: single render (uniforms interpolated elsewhere)
            Some(a)
        }

        (Some(a), Some(b)) => {
            // Different trees: render both, lerp pixels
            Some(VisualizerNode::lerp(a, b, t))
        }
    }
}

/// Combine multiple tile trees with their amounts baked in
/// Tiles are applied in order: result = lerp(lerp(lerp(black, A, amtA), B, amtB), C, amtC)
pub fn build_tile_composite_tree(
    tiles: &[(VisualizerNode, f32)],  // (tree, amount) pairs, ordered by tile index
) -> Option<VisualizerNode> {
    if tiles.is_empty() {
        return None;
    }

    let mut result = VisualizerNode::black();

    for (tree, amount) in tiles {
        if *amount <= 0.0 {
            continue;  // Skip inactive tiles
        }
        if *amount >= 1.0 {
            // Full opacity: just use this tree directly
            result = tree.clone();
        } else {
            // Partial opacity: lerp with current result
            result = VisualizerNode::lerp(result, tree.clone(), *amount);
        }
    }

    // If result is still black, return None
    if matches!(&result.node, Some(Node::BlackBuffer(_))) {
        None
    } else {
        Some(result)
    }
}

fn trees_equal(a: &VisualizerNode, b: &VisualizerNode) -> bool {
    // Compare tree structure for optimization
    // (if same structure, we can render once with interpolated uniforms)
    match (&a.node, &b.node) {
        (Some(Node::Leaf(id_a)), Some(Node::Leaf(id_b))) => id_a == id_b,
        (Some(Node::BlackBuffer(_)), Some(Node::BlackBuffer(_))) => true,
        (Some(Node::Sequence(seq_a)), Some(Node::Sequence(seq_b))) => {
            seq_a.nodes.len() == seq_b.nodes.len()
                && seq_a.nodes.iter().zip(&seq_b.nodes).all(|(a, b)| trees_equal(a, b))
        }
        // Lerp nodes are never "equal" for this optimization
        _ => false,
    }
}
```

### 3.2 Modify `src-engine/src/render/display_render_target.rs`

Update to build visualizer tree using the functions from `tree.rs`. The tree is built during scene rendering and stored in `DisplayRenderTarget.visualizer_tree`.

### 3.3 Modify `src-tauri/src/display_loop.rs`

In `run_display_loop()`:

1. Get audio analysis via `dmx_engine::audio::get_audio_analysis()`
2. Get beat_t from beat metadata
3. Get palette colors from scene
4. Get visualizer tree from `DisplayRenderTarget`
5. If tree is `Some`, call `shader_state.render_and_readback()` with the tree
6. If tree is `None` or render fails, output black
7. Send pixel buffer to DDP/WLED output

### 3.4 Add Tauri commands

```rust
#[tauri::command]
pub async fn compile_visualizer(
    visualizer_id: u64,
    glsl_source: String,
    state: State<'_, Arc<Mutex<ShaderState>>>,
) -> Result<VisualizerCompilationResult, String> {
    let mut shader_state = state.lock().map_err(|e| e.to_string())?;
    shader_state.compile_shader(visualizer_id, &glsl_source)
}

#[tauri::command]
pub fn get_builtin_visualizers() -> Vec<Visualizer> {
    dmx_engine::visualizer::builtin::BUILTIN_VISUALIZERS
        .iter()
        .map(|b| Visualizer {
            id: b.id,
            name: b.name.to_string(),
            glsl_source: b.glsl_source.to_string(),
            is_builtin: true,
        })
        .collect()
}

#[tauri::command]
pub fn delete_visualizer(
    visualizer_id: u64,
    state: State<'_, Arc<Mutex<ShaderState>>>,
) -> Result<(), String> {
    let mut shader_state = state.lock().map_err(|e| e.to_string())?;
    shader_state.mark_for_deletion(visualizer_id);
    Ok(())
}
```

### 3.5 Register in `src-tauri/src/lib.rs`

- Add `ShaderState` to app state via `.manage(Arc::new(Mutex::new(ShaderState::new()?)))`
- Register commands in `invoke_handler`

---

## Phase 4: Frontend - Monaco Editor

### 4.1 Install dependencies

```bash
pnpm add @monaco-editor/react monaco-editor
```

### 4.2 Create `src/components/MonacoEditor.tsx`

Lazy-loaded wrapper component:

```tsx
import { lazy, Suspense } from 'react';

const MonacoEditorInner = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.Editor })),
);

interface MonacoEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
  readOnly?: boolean;
  errorLine?: number;
}

export function MonacoEditor({
  value,
  onChange,
  readOnly,
  errorLine,
}: MonacoEditorProps) {
  return (
    <Suspense
      fallback={<div className={styles.loading}>Loading editor...</div>}
    >
      <MonacoEditorInner
        height="100%"
        language="c" // GLSL is C-like, works well
        theme="vs-dark"
        value={value}
        onChange={onChange}
        options={{
          readOnly,
          minimap: { enabled: false },
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          fontSize: 14,
          fontFamily: 'monospace',
        }}
        onMount={(editor, monaco) => {
          // Set error marker if errorLine is provided
          if (errorLine) {
            monaco.editor.setModelMarkers(editor.getModel()!, 'glsl', [
              {
                startLineNumber: errorLine,
                startColumn: 1,
                endLineNumber: errorLine,
                endColumn: 1000,
                message: 'Compilation error',
                severity: monaco.MarkerSeverity.Error,
              },
            ]);
          }
        }}
      />
    </Suspense>
  );
}
```

---

## Phase 5: Frontend - Visualizers Tab

### 5.1 Create `src/pages/patch/VisualizerEditor.tsx`

Two-pane layout following DisplayEditor pattern:

**Left pane (VisualizerList)**:

- "Built-in" section with read-only visualizers
- "User" section with editable visualizers
- "+ Add Visualizer" button

**Right pane (VisualizerEditorPane)**:

- Banner for built-in: "Read-only. Copy to edit."
- Monaco editor with GLSL code
- "Compile & Save" button
- Error display with line number
- "Delete" button (user visualizers only, warns if in use)

### 5.2 Create `src/pages/patch/VisualizerEditor.module.css`

Style matching DisplayEditor layout.

### 5.3 Modify `src/pages/patch/PatchPage.tsx`

Add Visualizers tab (after Displays):

```tsx
const VISUALIZER_KEY = 'visualizer';
// ...
[VISUALIZER_KEY]: { name: 'Visualizers', contents: <VisualizerEditor /> },
```

### 5.4 Create `src/system_interfaces/shader.ts`

```typescript
import { invoke } from '@tauri-apps/api/core';
import {
  Visualizer,
  VisualizerCompilationResult,
} from '@dmx-controller/proto/visualizer_pb';

export async function compileVisualizer(
  id: bigint,
  source: string,
): Promise<VisualizerCompilationResult> {
  const result = await invoke<Uint8Array>('compile_visualizer', {
    visualizerId: id,
    glslSource: source,
  });
  return VisualizerCompilationResult.fromBinary(result);
}

export async function getBuiltinVisualizers(): Promise<Visualizer[]> {
  const result = await invoke<Uint8Array[]>('get_builtin_visualizers');
  return result.map((bytes) => Visualizer.fromBinary(bytes));
}

export async function deleteVisualizer(id: bigint): Promise<void> {
  await invoke('delete_visualizer', { visualizerId: id });
}
```

---

## Phase 6: Effect Integration

### 6.1 Create `src/components/VisualizerSelect.tsx`

Multi-select component for choosing visualizers in effects:

- Shows built-in and user visualizers grouped
- Drag-to-reorder for sequencing multiple visualizers
- Used when effect targets a display

### 6.2 Modify effect editing UI

In `src/components/EffectDetails.tsx` (or equivalent), add visualizer selector when output is a display. Show the selector only for display outputs, not DMX fixtures.

---

## Phase 7: Testing & Verification

### 7.1 Manual testing checklist

1. **iOS Spike (Phase 0)**
   - [ ] wgpu initializes on iOS simulator
   - [ ] Metal backend detected
   - [ ] Can create RGBA8Unorm texture

2. **Visualizers Tab**
   - [ ] Tab appears in PatchPage
   - [ ] Built-in visualizers display in list
   - [ ] Can create new user visualizer
   - [ ] Monaco editor loads (lazy)
   - [ ] Built-in visualizers are read-only
   - [ ] Can copy built-in to create editable version
   - [ ] Can delete user visualizers
   - [ ] Deletion warning if visualizer is in use

3. **Shader Compilation**
   - [ ] Valid shader compiles successfully
   - [ ] Invalid shader shows error with line number
   - [ ] Error highlights in Monaco editor
   - [ ] Shader cached after successful compile
   - [ ] Missing/failed shaders render as black

4. **Display Rendering**
   - [ ] Display shows rendered shader output (RGBA8Unorm)
   - [ ] Sequence: shader B receives output of shader A via `prev_pixel`
   - [ ] Lerp: cross-fade between different shaders works smoothly
   - [ ] Same-shader ramp: single render pass (uniforms interpolated by DisplayRenderTarget)
   - [ ] Fade in/out from black: shader blends correctly
   - [ ] Tile amounts correctly baked into Lerp.t values
   - [ ] All shaders in tree receive same uniform values
   - [ ] Audio bands reactive in shader
   - [ ] Beat phase updates correctly
   - [ ] Palette colors available in shader

5. **Performance**
   - [ ] 30 FPS maintained with shaders
   - [ ] No memory leaks on shader recompile
   - [ ] Texture pool grows dynamically as needed
   - [ ] Shader deletion deferred until render completes

### 7.2 Automated tests

- Add shader compilation tests in `src-tauri/src/shader.rs`
- Test tree building logic in `src-engine/src/visualizer/tree.rs`:
  - Same shader produces single Leaf node (no Lerp)
  - Different shaders produce Lerp node
  - Missing shader produces Lerp with BlackBuffer
  - Tile composite builds correct nested Lerp structure
  - trees_equal correctly identifies matching structures
- Test tree rendering in `shader.rs`:
  - All nodes receive same uniforms
  - Sequence passes buffers correctly
  - Lerp blends at correct t value
  - BlackBuffer returns constant black

### 7.3 Cleanup

```bash
pnpm run cleanup
```

---

## Critical Files

| File                                             | Purpose                           |
| ------------------------------------------------ | --------------------------------- |
| `proto/visualizer.proto`                         | New proto definitions             |
| `proto/display.proto`                            | Add visualizer_tree               |
| `proto/effect.proto`                             | Add visualizer_ids (repeated)     |
| `src-engine/src/visualizer/mod.rs`               | Shareable visualizer module       |
| `src-engine/src/visualizer/tree.rs`              | Tree building (reusable)          |
| `src-engine/src/visualizer/shader_wrap.rs`       | GLSL wrapping (reusable)          |
| `src-engine/src/visualizer/builtin.rs`           | Built-in shader sources           |
| `src-engine/src/visualizer/shaders/*.glsl`       | Built-in shader GLSL files        |
| `src-tauri/src/shader.rs`                        | wgpu rendering (native only)      |
| `src-tauri/src/shader_spike.rs`                  | iOS compatibility test (Phase 0)  |
| `src-tauri/src/display_loop.rs`                  | Integration point                 |
| `src-engine/src/render/display_render_target.rs` | Tree building in render pipeline  |
| `src/pages/patch/VisualizerEditor.tsx`           | Main UI component                 |
| `src/pages/patch/PatchPage.tsx`                  | Add tab                           |
| `src/components/MonacoEditor.tsx`                | Code editor wrapper (lazy-loaded) |

---

## Future Work (Not in Scope)

- **Frontend live preview**: Requires WebGL2 renderer in TypeScript reusing:
  - Tree structure from `src-engine/visualizer/tree.rs`
  - Shader sources from `src-engine/visualizer/builtin.rs`
  - GLSL wrapping from `src-engine/visualizer/shader_wrap.rs`
  - Note: Cannot pass buffers from Rust (too slow); must render in browser
- Shader hot-reload during tile activation
- Visualizer presets/templates
- naga → glslang swap if GLSL compatibility issues arise
