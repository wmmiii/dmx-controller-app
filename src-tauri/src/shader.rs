use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use dmx_engine::project;
use dmx_engine::proto::visualizer_node::Node;
use dmx_engine::proto::{Visualizer, VisualizerCompilationResult, VisualizerNode};
use dmx_engine::visualizer::builtin::{BUILTIN_VISUALIZERS, is_builtin};
use dmx_engine::visualizer::shader_wrap::{preamble_line_count, wrap_user_shader};
use dmx_engine::visualizer::uniforms::ShaderUniforms;
use prost::Message;
use tauri::State;

const TEXTURE_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// Sentinel pool index meaning "the constant 1x1 black texture".
const BLACK_IDX: usize = usize::MAX;

/// Sentinel pool index meaning "use the previous frame's persistent texture".
const PREV_FRAME_IDX: usize = usize::MAX - 1;

/// Maximum number of textures in the pool to prevent GPU OOM.
const MAX_POOL_SIZE: usize = 256;

/// A successfully compiled user shader and its render pipeline.
struct CompiledShader {
    pipeline: wgpu::RenderPipeline,
}

/// A single pooled texture with its view and availability state.
struct PooledTexture {
    texture: wgpu::Texture,
    view: wgpu::TextureView,
    in_use: bool,
}

/// Identifies the bind group a shader pass needs. Everything else in the bind
/// group (uniform buffer, sampler) is stable for the lifetime of the pool, so
/// the input texture is the only thing that varies between passes.
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum BindGroupKey {
    Shader(usize),
    /// Input texture indices plus the blend slot, which identifies the uniform
    /// buffer holding this pass's `t`. Each Lerp node in a frame needs its own
    /// buffer: `queue.write_buffer` writes are ordered against submits, not
    /// against pass recording, so a shared buffer would give every blend pass
    /// in the frame the last node's `t`.
    Blend(usize, usize, usize),
}

/// Dynamically growing pool of `Rgba8Unorm` textures of a fixed resolution.
///
/// Also owns the per-frame GPU resources that are sized to that resolution: the
/// uniform buffer every pass reads, the readback staging buffer, and the bind
/// group cache. Recreating these per pass (which is what a naive implementation
/// does) costs a GPU allocation for every node of the visualizer tree on every
/// frame — the dominant source of frame-time jitter in this loop.
struct TexturePool {
    entries: Vec<PooledTexture>,
    width: u32,
    height: u32,
    uniform_buffer: Option<wgpu::Buffer>,
    /// One uniform buffer per blend pass, reused across frames. Grown on demand
    /// and indexed by `blend_slot`, which resets at the start of each frame.
    blend_uniform_buffers: Vec<wgpu::Buffer>,
    blend_slot: usize,
    readback_buffer: Option<wgpu::Buffer>,
    bind_groups: HashMap<BindGroupKey, wgpu::BindGroup>,
}

impl TexturePool {
    fn new(width: u32, height: u32) -> Self {
        Self {
            entries: Vec::new(),
            width: width.max(1),
            height: height.max(1),
            uniform_buffer: None,
            blend_uniform_buffers: Vec::new(),
            blend_slot: 0,
            readback_buffer: None,
            bind_groups: HashMap::new(),
        }
    }

    /// Rebuild the pool at a new resolution if it changed. Clears all textures.
    fn resize(&mut self, width: u32, height: u32) {
        let width = width.max(1);
        let height = height.max(1);
        if width != self.width || height != self.height {
            self.width = width;
            self.height = height;
            self.entries.clear();
            // Cached bind groups reference the discarded texture views.
            self.bind_groups.clear();
            self.readback_buffer = None;
        }
    }

    fn uniform_buffer(&mut self, device: &wgpu::Device) -> &wgpu::Buffer {
        self.uniform_buffer.get_or_insert_with(|| {
            device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("visualizer_uniforms"),
                size: std::mem::size_of::<ShaderUniforms>() as u64,
                usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            })
        })
    }

    /// Claim the next blend slot for this frame, allocating its uniform buffer
    /// on first use.
    fn next_blend_slot(&mut self, device: &wgpu::Device) -> usize {
        let slot = self.blend_slot;
        self.blend_slot += 1;
        if slot >= self.blend_uniform_buffers.len() {
            self.blend_uniform_buffers
                .push(device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("visualizer_blend_uniforms"),
                    size: std::mem::size_of::<[f32; 4]>() as u64,
                    usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                    mapped_at_creation: false,
                }));
        }
        slot
    }

    fn acquire(&mut self, device: &wgpu::Device) -> Option<usize> {
        if let Some(idx) = self.entries.iter().position(|entry| !entry.in_use) {
            self.entries[idx].in_use = true;
            return Some(idx);
        }
        // Limit pool size to prevent GPU OOM
        if self.entries.len() >= MAX_POOL_SIZE {
            log::warn!(
                "Texture pool exhausted ({MAX_POOL_SIZE} textures); visualizer tree too complex",
            );
            return None;
        }
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("visualizer_pool_texture"),
            size: wgpu::Extent3d {
                width: self.width,
                height: self.height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: TEXTURE_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        self.entries.push(PooledTexture {
            texture,
            view,
            in_use: true,
        });
        Some(self.entries.len() - 1)
    }

    fn release(&mut self, idx: usize) {
        if idx != BLACK_IDX && idx != PREV_FRAME_IDX {
            self.entries[idx].in_use = false;
        }
    }

    fn release_all(&mut self) {
        for entry in &mut self.entries {
            entry.in_use = false;
        }
        self.blend_slot = 0;
    }
}

pub struct ShaderState {
    device: wgpu::Device,
    queue: wgpu::Queue,
    compiled_shaders: HashMap<u64, CompiledShader>,
    /// GLSL source last successfully compiled for each user shader ID.
    /// Used by `sync_visualizer_shaders` to detect new/changed/removed shaders.
    compiled_glsl: HashMap<u64, String>,

    /// Bind group layout / pipeline layout shared by all user shaders.
    shader_bind_group_layout: wgpu::BindGroupLayout,
    shader_pipeline_layout: wgpu::PipelineLayout,
    /// Shared fullscreen-triangle vertex shader.
    vertex_module: wgpu::ShaderModule,

    sampler: wgpu::Sampler,

    blend_pipeline: wgpu::RenderPipeline,
    blend_bind_group_layout: wgpu::BindGroupLayout,

    black_view: wgpu::TextureView,

    /// Per-display texture pools. Each display gets its own pool at its own
    /// resolution, avoiding pool thrashing when displays have different sizes.
    texture_pools: HashMap<u64, TexturePool>,
    pending_deletions: Vec<u64>,

    /// Previous frame's output texture for each display (`display_id` -> texture).
    /// Used to provide temporal continuity - shaders can sample the previous
    /// frame's pixels via the `prev_pixel` parameter.
    previous_frame_textures: HashMap<u64, wgpu::Texture>,
    previous_frame_views: HashMap<u64, wgpu::TextureView>,
}

impl ShaderState {
    pub async fn new() -> Result<Self, String> {
        // Prefer Vulkan/Metal/DX12 over GLES. The GLES backend logs spurious
        // `eglSwapInterval` errors when rendering to offscreen textures.
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: wgpu::Backends::VULKAN | wgpu::Backends::METAL | wgpu::Backends::DX12,
            ..Default::default()
        });

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
            })
            .await
            .map_err(|e| format!("No GPU adapter found: {e}"))?;

        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor::default())
            .await
            .map_err(|e| format!("Device request failed: {e}"))?;

        let vertex_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("visualizer_vertex"),
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(VERTEX_WGSL)),
        });

        // Layout for user shaders: uniforms + previous-pass texture + sampler.
        let shader_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("visualizer_shader_bgl"),
                entries: &[uniform_entry(0), texture_entry(1), sampler_entry(2)],
            });
        let shader_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("visualizer_shader_pl"),
                bind_group_layouts: &[&shader_bind_group_layout],
                push_constant_ranges: &[],
            });

        // Blend pipeline (Lerp nodes): t + two textures + sampler.
        let blend_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("visualizer_blend_bgl"),
                entries: &[
                    uniform_entry(0),
                    texture_entry(1),
                    texture_entry(2),
                    sampler_entry(3),
                ],
            });
        let blend_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("visualizer_blend_pl"),
                bind_group_layouts: &[&blend_bind_group_layout],
                push_constant_ranges: &[],
            });
        let blend_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("visualizer_blend"),
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(BLEND_WGSL)),
        });
        let blend_pipeline = build_pipeline(
            &device,
            "visualizer_blend_pipeline",
            &blend_pipeline_layout,
            &vertex_module,
            &blend_module,
            "fs_main",
        );

        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("visualizer_sampler"),
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });

        // Constant 1x1 black texture used for fades / empty inputs.
        let black_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("visualizer_black"),
            size: wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: TEXTURE_FORMAT,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &black_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &[0u8, 0, 0, 255],
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(4),
                rows_per_image: Some(1),
            },
            wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
        );
        let black_view = black_texture.create_view(&wgpu::TextureViewDescriptor::default());

        let mut state = Self {
            device,
            queue,
            compiled_shaders: HashMap::new(),
            compiled_glsl: HashMap::new(),
            shader_bind_group_layout,
            shader_pipeline_layout,
            vertex_module,
            sampler,
            blend_pipeline,
            blend_bind_group_layout,
            black_view,
            texture_pools: HashMap::new(),
            pending_deletions: Vec::new(),
            previous_frame_textures: HashMap::new(),
            previous_frame_views: HashMap::new(),
        };

        // Built-in visualizers are always available; compile them up front so
        // leaf nodes referencing their IDs render immediately.
        for (id, builtin) in BUILTIN_VISUALIZERS.iter() {
            let result = state.compile_shader(*id, builtin.glsl_source);
            if !result.success {
                log::error!(
                    "Failed to compile built-in visualizer '{}' (id {}): {}",
                    builtin.name,
                    id,
                    result.error_message
                );
            }
        }

        Ok(state)
    }

    /// Compile a user shader. Compilation failures are reported in the returned
    /// struct (with a 1-based line number into the user's source), not as `Err`.
    pub fn compile_shader(&mut self, id: u64, glsl_source: &str) -> VisualizerCompilationResult {
        let wrapped = wrap_user_shader(glsl_source);
        log::debug!("Compiling shader {id}, wrapped GLSL:\n{wrapped}");

        let mut frontend = naga::front::glsl::Frontend::default();
        let options = naga::front::glsl::Options::from(naga::ShaderStage::Fragment);
        let module = match frontend.parse(&options, &wrapped) {
            Ok(module) => module,
            Err(errors) => {
                let error_line = errors.errors.first().map_or(0, |e| {
                    e.meta
                        .location(&wrapped)
                        .line_number
                        .saturating_sub(preamble_line_count())
                });
                let error_message = errors
                    .errors
                    .first()
                    .map_or_else(|| "Unknown error".to_string(), |e| e.kind.to_string());
                return VisualizerCompilationResult {
                    success: false,
                    error_message,
                    error_line,
                };
            }
        };

        let mut validator = naga::valid::Validator::new(
            naga::valid::ValidationFlags::all(),
            naga::valid::Capabilities::all(),
        );
        if let Err(e) = validator.validate(&module) {
            return VisualizerCompilationResult {
                success: false,
                error_message: e.to_string(),
                error_line: 0,
            };
        }

        // `module` was validated above for line-numbered error reporting; wgpu
        // re-parses the GLSL itself via `ShaderSource::Glsl`.
        drop(module);
        let fragment_module = self
            .device
            .create_shader_module(wgpu::ShaderModuleDescriptor {
                label: Some("visualizer_user_shader"),
                source: wgpu::ShaderSource::Glsl {
                    shader: Cow::Owned(wrapped),
                    stage: naga::ShaderStage::Fragment,
                    defines: Default::default(),
                },
            });
        let pipeline = build_pipeline(
            &self.device,
            "visualizer_user_pipeline",
            &self.shader_pipeline_layout,
            &self.vertex_module,
            &fragment_module,
            "main",
        );

        self.compiled_shaders
            .insert(id, CompiledShader { pipeline });
        self.compiled_glsl.insert(id, glsl_source.to_string());

        VisualizerCompilationResult {
            success: true,
            error_message: String::new(),
            error_line: 0,
        }
    }

    /// Queue a shader for deletion. Removal happens after the current render
    /// completes (renders hold the state lock, so this can't race a render).
    pub fn mark_for_deletion(&mut self, id: u64) {
        self.pending_deletions.push(id);
    }

    /// Render `tree` at the given resolution and read the result back as RGBA8
    /// bytes (row-major, 4 bytes per pixel). Returns black on an empty tree.
    ///
    /// The `display_id` is used to track previous frames - each display gets its
    /// own temporal buffer that feeds into the next frame's `prev_pixel` input.
    pub fn render_and_readback(
        &mut self,
        display_id: u64,
        tree: &VisualizerNode,
        uniforms: &ShaderUniforms,
        width: u32,
        height: u32,
    ) -> Vec<u8> {
        let width = width.max(1);
        let height = height.max(1);

        // Get or create the texture pool for this display
        let pool = self
            .texture_pools
            .entry(display_id)
            .or_insert_with(|| TexturePool::new(width, height));
        pool.resize(width, height);
        pool.release_all();

        // Every node of the tree reads the same uniforms, so upload them once
        // per frame instead of building a fresh buffer per pass.
        let uniform_buffer = pool.uniform_buffer(&self.device).clone();
        self.queue
            .write_buffer(&uniform_buffer, 0, bytemuck::bytes_of(uniforms));

        // Get the previous frame's texture view for this display, or use black if none exists
        let prev_idx = self.get_previous_frame_idx(display_id);

        // Create a single command encoder for all render passes in this frame
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("visualizer_frame_encoder"),
            });

        let result_idx = self.render_tree(display_id, tree, uniforms, prev_idx, &mut encoder);

        // Record the previous-frame copy and the readback copy into the same
        // encoder as the render passes. Splitting these across three submits
        // (with a blocking map in between) drained the GPU pipeline every frame.
        if result_idx == BLACK_IDX {
            // If we're rendering black, clear the previous frame texture
            self.previous_frame_textures.remove(&display_id);
            if self.previous_frame_views.remove(&display_id).is_some() {
                self.invalidate_prev_frame_bind_groups(display_id);
            }
        } else {
            self.record_store_previous_frame(display_id, result_idx, width, height, &mut encoder);
            self.record_readback_copy(display_id, result_idx, width, height, &mut encoder);
        }

        self.queue.submit(Some(encoder.finish()));

        let pixels = if result_idx == BLACK_IDX {
            vec![0u8; (width as usize) * (height as usize) * 4]
        } else {
            self.map_readback(display_id, width, height)
        };

        for id in self.pending_deletions.drain(..) {
            self.compiled_shaders.remove(&id);
        }

        pixels
    }

    /// Get the pool index for the previous frame's texture, or `BLACK_IDX` if
    /// this is the first frame for this display.
    fn get_previous_frame_idx(&self, display_id: u64) -> usize {
        if self.previous_frame_views.contains_key(&display_id) {
            PREV_FRAME_IDX
        } else {
            BLACK_IDX
        }
    }

    /// Record a copy of the rendered result from the pool into a persistent
    /// texture for this display, so it can be used as input to the next frame.
    fn record_store_previous_frame(
        &mut self,
        display_id: u64,
        result_idx: usize,
        width: u32,
        height: u32,
        encoder: &mut wgpu::CommandEncoder,
    ) {
        // Check if we need to create or resize the previous frame texture
        let needs_new_texture = self
            .previous_frame_textures
            .get(&display_id)
            .is_none_or(|tex| tex.width() != width || tex.height() != height);

        if needs_new_texture {
            let texture = self.device.create_texture(&wgpu::TextureDescriptor {
                label: Some(&format!("previous_frame_{display_id}")),
                size: wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: TEXTURE_FORMAT,
                usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
                view_formats: &[],
            });
            let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
            self.previous_frame_textures.insert(display_id, texture);
            self.previous_frame_views.insert(display_id, view);
            self.invalidate_prev_frame_bind_groups(display_id);
        }

        // Direct texture copy - vertex shader Y-flip ensures coordinates are aligned
        encoder.copy_texture_to_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &self.texture_pools[&display_id].entries[result_idx].texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyTextureInfo {
                texture: self.previous_frame_textures.get(&display_id).unwrap(),
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );
    }

    /// Remove previous frame textures and pools for displays that no longer exist.
    /// Called during project sync to prevent memory leaks.
    /// Ensures all pending GPU work is complete before removing resources.
    fn cleanup_stale_display_textures(&mut self, active_display_ids: &[u64]) {
        let stale_ids: Vec<u64> = self
            .previous_frame_textures
            .keys()
            .chain(self.texture_pools.keys())
            .filter(|id| !active_display_ids.contains(id))
            .copied()
            .collect();

        if !stale_ids.is_empty() {
            // Ensure all pending GPU work is complete before removing resources
            self.queue.submit([]);
            let _ = self.device.poll(wgpu::PollType::Wait);
        }

        for id in stale_ids {
            self.previous_frame_textures.remove(&id);
            self.previous_frame_views.remove(&id);
            self.texture_pools.remove(&id);
            log::debug!("Cleaned up textures and pool for deleted display {id}");
        }
    }

    /// Recursively render a node, returning the pool index of its result.
    /// `display_id` is used to look up the previous frame's texture and texture pool.
    /// `encoder` is the shared command encoder for batching all render passes.
    fn render_tree(
        &mut self,
        display_id: u64,
        node: &VisualizerNode,
        uniforms: &ShaderUniforms,
        prev_idx: usize,
        encoder: &mut wgpu::CommandEncoder,
    ) -> usize {
        match &node.node {
            Some(Node::Leaf(shader_id)) => {
                if !self.compiled_shaders.contains_key(shader_id) {
                    return BLACK_IDX;
                }
                let pool = self.texture_pools.get_mut(&display_id).unwrap();
                let Some(out_idx) = pool.acquire(&self.device) else {
                    return BLACK_IDX; // Pool exhausted, graceful fallback
                };
                self.ensure_shader_bind_group(display_id, prev_idx);
                let pool = &self.texture_pools[&display_id];
                let bind_group = &pool.bind_groups[&BindGroupKey::Shader(prev_idx)];
                let out_view = &pool.entries[out_idx].view;
                let pipeline = &self.compiled_shaders[shader_id].pipeline;
                #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
                record_fullscreen_pass(
                    pipeline,
                    bind_group,
                    out_view,
                    uniforms.resolution[0] as u32,
                    uniforms.resolution[1] as u32,
                    encoder,
                );
                out_idx
            }

            Some(Node::BlackBuffer(_)) | None => BLACK_IDX,

            Some(Node::Sequence(seq)) => {
                let mut buffer_idx = prev_idx;
                for child in &seq.nodes {
                    let new_idx = self.render_tree(display_id, child, uniforms, buffer_idx, encoder);
                    if buffer_idx != prev_idx {
                        self.texture_pools.get_mut(&display_id).unwrap().release(buffer_idx);
                    }
                    buffer_idx = new_idx;
                }
                buffer_idx
            }

            Some(Node::Lerp(lerp)) => {
                let idx_a = match lerp.a.as_deref() {
                    Some(a) => self.render_tree(display_id, a, uniforms, prev_idx, encoder),
                    None => BLACK_IDX,
                };
                let idx_b = match lerp.b.as_deref() {
                    Some(b) => self.render_tree(display_id, b, uniforms, prev_idx, encoder),
                    None => BLACK_IDX,
                };
                let pool = self.texture_pools.get_mut(&display_id).unwrap();
                let Some(out_idx) = pool.acquire(&self.device) else {
                    // Pool exhausted, release children and return black
                    if idx_a != prev_idx {
                        pool.release(idx_a);
                    }
                    if idx_b != prev_idx {
                        pool.release(idx_b);
                    }
                    return BLACK_IDX;
                };
                {
                    let slot = self
                        .texture_pools
                        .get_mut(&display_id)
                        .unwrap()
                        .next_blend_slot(&self.device);
                    self.ensure_blend_bind_group(display_id, idx_a, idx_b, slot);

                    let blend_uniform: [f32; 4] = [lerp.t, 0.0, 0.0, 0.0];
                    let pool = &self.texture_pools[&display_id];
                    self.queue.write_buffer(
                        &pool.blend_uniform_buffers[slot],
                        0,
                        bytemuck::cast_slice(&blend_uniform),
                    );
                    let bind_group = &pool.bind_groups[&BindGroupKey::Blend(idx_a, idx_b, slot)];
                    let out_view = &pool.entries[out_idx].view;
                    record_fullscreen_pass(
                        &self.blend_pipeline,
                        bind_group,
                        out_view,
                        pool.width,
                        pool.height,
                        encoder,
                    );
                }
                let pool = self.texture_pools.get_mut(&display_id).unwrap();
                if idx_a != prev_idx {
                    pool.release(idx_a);
                }
                if idx_b != prev_idx {
                    pool.release(idx_b);
                }
                out_idx
            }
        }
    }

    /// Drop cached bind groups that reference this display's previous-frame
    /// view. Called whenever that view is replaced or removed, since the cache
    /// otherwise keeps sampling a texture that is no longer the previous frame.
    fn invalidate_prev_frame_bind_groups(&mut self, display_id: u64) {
        let Some(pool) = self.texture_pools.get_mut(&display_id) else {
            return;
        };
        pool.bind_groups.retain(|key, _| match key {
            BindGroupKey::Shader(in_idx) => *in_idx != PREV_FRAME_IDX,
            BindGroupKey::Blend(a, b, _) => *a != PREV_FRAME_IDX && *b != PREV_FRAME_IDX,
        });
    }

    /// Get the texture view for a given index. Handles pool indices, `BLACK_IDX`,
    /// and the special `PREV_FRAME_IDX` sentinel which maps to the previous frame's
    /// persistent texture for this display.
    fn view_for_idx(&self, display_id: u64, idx: usize) -> &wgpu::TextureView {
        if idx == BLACK_IDX {
            &self.black_view
        } else if idx == PREV_FRAME_IDX {
            // Use the previous frame's texture if available, otherwise black
            self.previous_frame_views
                .get(&display_id)
                .unwrap_or(&self.black_view)
        } else {
            &self.texture_pools[&display_id].entries[idx].view
        }
    }

    /// Populate the cached bind group for a shader pass reading `in_idx`.
    /// Cached entries stay valid until the pool is resized, so after the first
    /// frame this is a hash lookup rather than a driver-side allocation.
    fn ensure_shader_bind_group(&mut self, display_id: u64, in_idx: usize) {
        let key = BindGroupKey::Shader(in_idx);
        if self.texture_pools[&display_id].bind_groups.contains_key(&key) {
            return;
        }

        let in_view = self.view_for_idx(display_id, in_idx).clone();
        let pool = self.texture_pools.get_mut(&display_id).unwrap();
        let uniform_buffer = pool.uniform_buffer(&self.device).clone();
        let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("visualizer_bind_group"),
            layout: &self.shader_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&in_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
            ],
        });
        self.texture_pools
            .get_mut(&display_id)
            .unwrap()
            .bind_groups
            .insert(key, bind_group);
    }

    fn ensure_blend_bind_group(
        &mut self,
        display_id: u64,
        idx_a: usize,
        idx_b: usize,
        slot: usize,
    ) {
        let key = BindGroupKey::Blend(idx_a, idx_b, slot);
        if self.texture_pools[&display_id].bind_groups.contains_key(&key) {
            return;
        }

        let view_a = self.view_for_idx(display_id, idx_a).clone();
        let view_b = self.view_for_idx(display_id, idx_b).clone();
        let uniform_buffer = self.texture_pools[&display_id].blend_uniform_buffers[slot].clone();
        let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("visualizer_blend_bind_group"),
            layout: &self.blend_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&view_a),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(&view_b),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
            ],
        });
        self.texture_pools
            .get_mut(&display_id)
            .unwrap()
            .bind_groups
            .insert(key, bind_group);
    }

    /// Record the texture-to-buffer copy that feeds `map_readback`. The staging
    /// buffer is kept for the lifetime of the pool; allocating (and implicitly
    /// destroying) a mappable buffer every frame is a per-frame GPU allocation.
    fn record_readback_copy(
        &mut self,
        display_id: u64,
        idx: usize,
        width: u32,
        height: u32,
        encoder: &mut wgpu::CommandEncoder,
    ) {
        let padded_bytes_per_row = align_up(width * 4, 256);
        let buffer_size = u64::from(padded_bytes_per_row) * u64::from(height);

        let device = &self.device;
        let pool = self.texture_pools.get_mut(&display_id).unwrap();
        let output_buffer = pool
            .readback_buffer
            .get_or_insert_with(|| {
                device.create_buffer(&wgpu::BufferDescriptor {
                    label: Some("visualizer_readback"),
                    size: buffer_size,
                    usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
                    mapped_at_creation: false,
                })
            })
            .clone();

        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture: &pool.entries[idx].texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyBufferInfo {
                buffer: &output_buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(padded_bytes_per_row),
                    rows_per_image: Some(height),
                },
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );
    }

    /// Map the staging buffer written by `record_readback_copy` and return
    /// tightly-packed RGBA8 bytes. Blocks until the GPU has finished the frame.
    fn map_readback(&self, display_id: u64, width: u32, height: u32) -> Vec<u8> {
        let unpadded_bytes_per_row = width * 4;
        let padded_bytes_per_row = align_up(unpadded_bytes_per_row, 256);
        let buffer_size = u64::from(padded_bytes_per_row) * u64::from(height);

        let Some(output_buffer) = self.texture_pools[&display_id].readback_buffer.as_ref() else {
            return vec![0u8; (width * height * 4) as usize];
        };

        let slice = output_buffer.slice(..buffer_size);
        slice.map_async(wgpu::MapMode::Read, |_| {});
        let _ = self.device.poll(wgpu::PollType::Wait);

        let data = slice.get_mapped_range();
        let mut pixels = Vec::with_capacity((width * height * 4) as usize);
        // Flip Y-axis: wgpu/Vulkan has origin at top-left, but shaders expect
        // OpenGL/WebGL convention (origin at bottom-left). Read rows in reverse
        // order to match the coordinate system that user shaders expect.
        for row in (0..height).rev() {
            let start = (row * padded_bytes_per_row) as usize;
            let end = start + unpadded_bytes_per_row as usize;
            pixels.extend_from_slice(&data[start..end]);
        }
        drop(data);
        output_buffer.unmap();
        pixels
    }
}

/// Compile (or recompile) a user visualizer's GLSL. Returns a prost-encoded
/// `VisualizerCompilationResult` so the frontend can surface line-numbered
/// errors. Compilation failures are reported in the payload, not as `Err`.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn compile_visualizer(
    shader_state: State<'_, Arc<Mutex<ShaderState>>>,
    id: String,
    glsl_source: String,
) -> Result<Vec<u8>, String> {
    let id: u64 = id
        .parse()
        .map_err(|_| format!("Invalid visualizer ID: {id}"))?;
    let mut state = shader_state.lock().unwrap_or_else(|e| {
        log::error!("Shader state lock poisoned, recovering");
        e.into_inner()
    });
    Ok(state.compile_shader(id, &glsl_source).encode_to_vec())
}

/// Return the built-in visualizers as a map from ID string to prost-encoded
/// `Visualizer` messages. The map shape matches `project.visualizers` so the
/// frontend can treat builtins and user visualizers uniformly.
#[tauri::command]
pub fn get_builtin_visualizers() -> std::collections::HashMap<String, Vec<u8>> {
    BUILTIN_VISUALIZERS
        .iter()
        .map(|(id, b)| {
            let encoded = Visualizer {
                name: b.name.to_string(),
                glsl_source: b.glsl_source.to_string(),
            }
            .encode_to_vec();
            (id.to_string(), encoded)
        })
        .collect()
}

/// Synchronise GPU compiled shaders with `project.visualizers`.
///
/// Called from `rebuild_outputs` so that every project mutation — including
/// undo, redo, load, and import — keeps shader state consistent without
/// requiring explicit compile/delete calls in the UI.
pub fn sync_visualizer_shaders(shader_state: &Mutex<ShaderState>) {
    let mut state = shader_state.lock().unwrap_or_else(|e| {
        log::error!("Shader state lock poisoned, recovering");
        e.into_inner()
    });

    // This runs on every project mutation, so only the sources that actually
    // changed are cloned out of the project — copying every visualizer's GLSL
    // on each mutation shows up as allocation churn while dragging a control.
    let scan: Result<(Vec<u64>, Vec<(u64, String)>, Vec<u64>), String> =
        project::with_project(|project| {
            let stale = state
                .compiled_shaders
                .keys()
                .filter(|&&id| !is_builtin(id) && !project.visualizers.contains_key(&id))
                .copied()
                .collect();
            let changed = project
                .visualizers
                .iter()
                .filter(|(id, viz)| {
                    state.compiled_glsl.get(id).map(String::as_str) != Some(&viz.glsl_source)
                })
                .map(|(&id, viz)| (id, viz.glsl_source.clone()))
                .collect();
            let displays = project.displays.keys().copied().collect();
            Ok((stale, changed, displays))
        });

    let (stale, changed, display_ids) = match scan {
        Ok(result) => result,
        Err(e) => {
            log::error!("shader sync: failed to read project: {e}");
            return;
        }
    };

    // Remove user shaders whose IDs are no longer in the project.
    for id in stale {
        state.mark_for_deletion(id);
        state.compiled_glsl.remove(&id);
    }

    // Compile shaders that are new or whose source has changed.
    for (id, glsl) in changed {
        let result = state.compile_shader(id, &glsl);
        if !result.success {
            log::warn!(
                "visualizer {id} failed to compile during project sync: {}",
                result.error_message
            );
        }
    }

    // Cleanup previous frame textures for deleted displays
    state.cleanup_stale_display_textures(&display_ids);
}

fn align_up(value: u32, alignment: u32) -> u32 {
    value.div_ceil(alignment) * alignment
}

/// Record a fullscreen render pass to the given encoder.
/// Does not submit - caller is responsible for batching and submitting.
fn record_fullscreen_pass(
    pipeline: &wgpu::RenderPipeline,
    bind_group: &wgpu::BindGroup,
    out_view: &wgpu::TextureView,
    width: u32,
    height: u32,
    encoder: &mut wgpu::CommandEncoder,
) {
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: Some("visualizer_pass"),
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view: out_view,
            depth_slice: None,
            resolve_target: None,
            ops: wgpu::Operations {
                load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                store: wgpu::StoreOp::Store,
            },
        })],
        depth_stencil_attachment: None,
        timestamp_writes: None,
        occlusion_query_set: None,
    });
    // Explicitly set viewport to match render target dimensions
    #[allow(clippy::cast_precision_loss)]
    pass.set_viewport(0.0, 0.0, width as f32, height as f32, 0.0, 1.0);
    pass.set_pipeline(pipeline);
    pass.set_bind_group(0, bind_group, &[]);
    pass.draw(0..3, 0..1);
}

fn build_pipeline(
    device: &wgpu::Device,
    label: &str,
    layout: &wgpu::PipelineLayout,
    vertex_module: &wgpu::ShaderModule,
    fragment_module: &wgpu::ShaderModule,
    fragment_entry: &str,
) -> wgpu::RenderPipeline {
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(label),
        layout: Some(layout),
        vertex: wgpu::VertexState {
            module: vertex_module,
            entry_point: Some("vs_main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[],
        },
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            ..Default::default()
        },
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        fragment: Some(wgpu::FragmentState {
            module: fragment_module,
            entry_point: Some(fragment_entry),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format: TEXTURE_FORMAT,
                blend: None,
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        multiview: None,
        cache: None,
    })
}

fn uniform_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Buffer {
            ty: wgpu::BufferBindingType::Uniform,
            has_dynamic_offset: false,
            min_binding_size: None,
        },
        count: None,
    }
}

fn texture_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Texture {
            sample_type: wgpu::TextureSampleType::Float { filterable: true },
            view_dimension: wgpu::TextureViewDimension::D2,
            multisampled: false,
        },
        count: None,
    }
}

fn sampler_entry(binding: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
        count: None,
    }
}

/// Fullscreen triangle. No vertex buffer; positions come from the vertex index.
/// Outputs clip-space position as a varying so fragment shaders can compute UV.
/// Uses `flat` interpolation to match GLSL's default for non-qualified inputs
/// when parsed by naga.
const VERTEX_WGSL: &str = r"
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) @interpolate(perspective, centroid) clip_pos: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VertexOutput {
    var p = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );
    var out: VertexOutput;
    out.position = vec4<f32>(p[idx], 0.0, 1.0);
    // Flip Y so UV.y=0 at screen top, matching texture coord V=0 at row 0
    out.clip_pos = vec2<f32>(p[idx].x, -p[idx].y);
    return out;
}
";

/// Blend two textures by `u_t.x`. Used for Lerp nodes.
const BLEND_WGSL: &str = r"
@group(0) @binding(0) var<uniform> u_t: vec4<f32>;
@group(0) @binding(1) var t_a: texture_2d<f32>;
@group(0) @binding(2) var t_b: texture_2d<f32>;
@group(0) @binding(3) var s_linear: sampler;

@fragment
fn fs_main(@builtin(position) pos: vec4<f32>, @location(0) @interpolate(perspective, centroid) clip_pos: vec2<f32>) -> @location(0) vec4<f32> {
    // Convert clip-space (-1..1) to UV (0..1)
    var uv = clip_pos * 0.5 + 0.5;
    // Textures are in Vulkan format (Y down), no flip needed for sampling
    let a = textureSample(t_a, s_linear, uv);
    let b = textureSample(t_b, s_linear, uv);
    return mix(a, b, u_t.x);
}
";

#[cfg(test)]
mod layout_tests {
    use naga::ShaderStage;
    use naga::front::glsl::{Frontend, Options};

    #[test]
    fn test_current_uniform_layout() {
        // This GLSL must match the current PREAMBLE in shader_wrap.rs
        let glsl = r#"
#version 450

layout(set = 0, binding = 0, std140) uniform Uniforms {
    vec3 u_color;                // offset 0: display color RGB
    float _pad_color;            // offset 12: padding for vec3
    vec2 u_resolution;           // offset 16
    float u_beat_t;              // offset 24: beat phase (0-1)
    uint u_time_ms;              // offset 28: time in milliseconds
    uint u_beat_count;           // offset 32: beat counter
    uint _pad0;                  // offset 36: padding for vec4 alignment
    vec2 _pad1;                  // offset 40: padding for vec3 alignment
    vec3 u_palette_primary;      // offset 48
    float _pad2;                 // offset 60: padding for vec3 alignment
    vec3 u_palette_secondary;    // offset 64
    float _pad3;                 // offset 76: padding for vec3 alignment
    vec3 u_palette_tertiary;     // offset 80
    float _pad4;                 // offset 92: padding for array alignment
    float u_audio_bands[16];     // offset 96: std140: each element takes 16 bytes
};

layout(set = 0, binding = 1) uniform texture2D t_previous;
layout(set = 0, binding = 2) uniform sampler s_previous;

layout(location = 0) out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    fragColor = vec4(uv, 0.0, 1.0);
}
"#;

        let mut frontend = Frontend::default();
        let options = Options::from(ShaderStage::Fragment);
        let module = frontend.parse(&options, glsl).unwrap();

        for (_, ty) in module.types.iter() {
            if let naga::TypeInner::Struct { members, .. } = &ty.inner {
                if ty.name.as_deref() == Some("Uniforms") {
                    println!("\nUniforms struct member offsets:");
                    for (i, member) in members.iter().enumerate() {
                        println!("  [{}] {:?}: offset = {}", i, member.name, member.offset);
                    }

                    // Verify key offsets match ShaderUniforms struct
                    assert_eq!(members[0].offset, 0, "u_color should be at offset 0");
                    assert_eq!(members[2].offset, 16, "u_resolution should be at offset 16");
                    assert_eq!(members[8].offset, 48, "u_palette_primary should be at offset 48");
                    assert_eq!(members[14].offset, 96, "u_audio_bands should be at offset 96");
                }
            }
        }
    }
}
