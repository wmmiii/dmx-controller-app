//! GPU rendering of visualizer trees via wgpu (native only).
//!
//! Shareable, non-GPU logic (tree building, GLSL wrapping, uniform layout,
//! built-in sources) lives in `dmx_engine::visualizer`. This module owns the
//! wgpu device and turns a `VisualizerNode` tree plus a set of uniforms into a
//! single RGBA8 pixel buffer.
//!
//! Rendering is GPU-side: every node renders into an `Rgba8Unorm` texture from
//! a dynamically sized pool, intermediate textures stay on the GPU, and only
//! the final result is read back to the CPU.

use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use dmx_engine::proto::visualizer_node::Node;
use dmx_engine::proto::{Visualizer, VisualizerCompilationResult, VisualizerNode};
use dmx_engine::visualizer::builtin::BUILTIN_VISUALIZERS;
use dmx_engine::visualizer::shader_wrap::{preamble_line_count, wrap_user_shader};
use dmx_engine::visualizer::uniforms::ShaderUniforms;
use prost::Message;
use tauri::State;
use wgpu::util::DeviceExt;

const TEXTURE_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// Sentinel pool index meaning "the constant 1x1 black texture".
const BLACK_IDX: usize = usize::MAX;

/// A successfully compiled user shader and its render pipeline.
struct CompiledShader {
    pipeline: wgpu::RenderPipeline,
}

/// Dynamically growing pool of `Rgba8Unorm` textures of a fixed resolution.
struct TexturePool {
    textures: Vec<wgpu::Texture>,
    views: Vec<wgpu::TextureView>,
    in_use: Vec<bool>,
    width: u32,
    height: u32,
}

impl TexturePool {
    fn new(width: u32, height: u32) -> Self {
        Self {
            textures: Vec::new(),
            views: Vec::new(),
            in_use: Vec::new(),
            width: width.max(1),
            height: height.max(1),
        }
    }

    /// Rebuild the pool at a new resolution if it changed. Clears all textures.
    fn resize(&mut self, width: u32, height: u32) {
        let width = width.max(1);
        let height = height.max(1);
        if width != self.width || height != self.height {
            self.width = width;
            self.height = height;
            self.textures.clear();
            self.views.clear();
            self.in_use.clear();
        }
    }

    fn acquire(&mut self, device: &wgpu::Device) -> usize {
        if let Some(idx) = self.in_use.iter().position(|&used| !used) {
            self.in_use[idx] = true;
            return idx;
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
        self.textures.push(texture);
        self.views.push(view);
        self.in_use.push(true);
        self.textures.len() - 1
    }

    fn release(&mut self, idx: usize) {
        if idx != BLACK_IDX {
            self.in_use[idx] = false;
        }
    }

    fn release_all(&mut self) {
        self.in_use.fill(false);
    }
}

pub struct ShaderState {
    device: wgpu::Device,
    queue: wgpu::Queue,
    compiled_shaders: HashMap<u64, CompiledShader>,

    /// Bind group layout / pipeline layout shared by all user shaders.
    shader_bind_group_layout: wgpu::BindGroupLayout,
    shader_pipeline_layout: wgpu::PipelineLayout,
    /// Shared fullscreen-triangle vertex shader.
    vertex_module: wgpu::ShaderModule,

    sampler: wgpu::Sampler,

    blend_pipeline: wgpu::RenderPipeline,
    blend_bind_group_layout: wgpu::BindGroupLayout,

    black_view: wgpu::TextureView,

    texture_pool: TexturePool,
    pending_deletions: Vec<u64>,
}

impl ShaderState {
    pub async fn new() -> Result<Self, String> {
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
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
                entries: &[
                    uniform_entry(0),
                    texture_entry(1),
                    sampler_entry(2),
                ],
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
            shader_bind_group_layout,
            shader_pipeline_layout,
            vertex_module,
            sampler,
            blend_pipeline,
            blend_bind_group_layout,
            black_view,
            texture_pool: TexturePool::new(1, 1),
            pending_deletions: Vec::new(),
        };

        // Built-in visualizers are always available; compile them up front so
        // leaf nodes referencing reserved IDs (1-999) render immediately.
        for builtin in BUILTIN_VISUALIZERS {
            let result = state.compile_shader(builtin.id, builtin.glsl_source);
            if !result.success {
                log::error!(
                    "Failed to compile built-in visualizer '{}' (id {}): {}",
                    builtin.name,
                    builtin.id,
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

        let mut frontend = naga::front::glsl::Frontend::default();
        let options = naga::front::glsl::Options::from(naga::ShaderStage::Fragment);
        let module = match frontend.parse(&options, &wrapped) {
            Ok(module) => module,
            Err(errors) => {
                let error_line = errors
                    .errors
                    .first()
                    .map_or(0, |e| {
                        e.meta
                            .location(&wrapped)
                            .line_number
                            .saturating_sub(preamble_line_count())
                    });
                return VisualizerCompilationResult {
                    success: false,
                    error_message: errors.to_string(),
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

        self.compiled_shaders.insert(id, CompiledShader { pipeline });

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
    pub fn render_and_readback(
        &mut self,
        tree: &VisualizerNode,
        uniforms: &ShaderUniforms,
        width: u32,
        height: u32,
    ) -> Vec<u8> {
        self.texture_pool.resize(width, height);
        self.texture_pool.release_all();

        let result_idx = self.render_tree(tree, uniforms, BLACK_IDX);

        let pixels = if result_idx == BLACK_IDX {
            vec![0u8; (width.max(1) as usize) * (height.max(1) as usize) * 4]
        } else {
            self.readback(result_idx, width.max(1), height.max(1))
        };

        for id in self.pending_deletions.drain(..) {
            self.compiled_shaders.remove(&id);
        }

        pixels
    }

    /// Recursively render a node, returning the pool index of its result.
    fn render_tree(
        &mut self,
        node: &VisualizerNode,
        uniforms: &ShaderUniforms,
        prev_idx: usize,
    ) -> usize {
        match &node.node {
            Some(Node::Leaf(shader_id)) => {
                if !self.compiled_shaders.contains_key(shader_id) {
                    return BLACK_IDX;
                }
                let out_idx = self.texture_pool.acquire(&self.device);
                let in_view = view_for(&self.texture_pool, &self.black_view, prev_idx);
                let out_view = &self.texture_pool.views[out_idx];
                let pipeline = &self.compiled_shaders[shader_id].pipeline;
                Self::render_shader(
                    &self.device,
                    &self.queue,
                    &self.shader_bind_group_layout,
                    &self.sampler,
                    pipeline,
                    uniforms,
                    in_view,
                    out_view,
                );
                out_idx
            }

            Some(Node::BlackBuffer(_)) | None => BLACK_IDX,

            Some(Node::Sequence(seq)) => {
                let mut buffer_idx = prev_idx;
                for child in &seq.nodes {
                    let new_idx = self.render_tree(child, uniforms, buffer_idx);
                    if buffer_idx != prev_idx {
                        self.texture_pool.release(buffer_idx);
                    }
                    buffer_idx = new_idx;
                }
                buffer_idx
            }

            Some(Node::Lerp(lerp)) => {
                let idx_a = match lerp.a.as_deref() {
                    Some(a) => self.render_tree(a, uniforms, prev_idx),
                    None => BLACK_IDX,
                };
                let idx_b = match lerp.b.as_deref() {
                    Some(b) => self.render_tree(b, uniforms, prev_idx),
                    None => BLACK_IDX,
                };
                let out_idx = self.texture_pool.acquire(&self.device);
                {
                    let view_a = view_for(&self.texture_pool, &self.black_view, idx_a);
                    let view_b = view_for(&self.texture_pool, &self.black_view, idx_b);
                    let out_view = &self.texture_pool.views[out_idx];
                    Self::blend_textures(
                        &self.device,
                        &self.queue,
                        &self.blend_bind_group_layout,
                        &self.blend_pipeline,
                        &self.sampler,
                        lerp.t,
                        view_a,
                        view_b,
                        out_view,
                    );
                }
                if idx_a != prev_idx {
                    self.texture_pool.release(idx_a);
                }
                if idx_b != prev_idx {
                    self.texture_pool.release(idx_b);
                }
                out_idx
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn render_shader(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        layout: &wgpu::BindGroupLayout,
        sampler: &wgpu::Sampler,
        pipeline: &wgpu::RenderPipeline,
        uniforms: &ShaderUniforms,
        in_view: &wgpu::TextureView,
        out_view: &wgpu::TextureView,
    ) {
        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("visualizer_uniforms"),
            contents: bytemuck::cast_slice(&[*uniforms]),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("visualizer_bind_group"),
            layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(in_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(sampler),
                },
            ],
        });
        run_fullscreen_pass(device, queue, pipeline, &bind_group, out_view);
    }

    #[allow(clippy::too_many_arguments)]
    fn blend_textures(
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        layout: &wgpu::BindGroupLayout,
        pipeline: &wgpu::RenderPipeline,
        sampler: &wgpu::Sampler,
        t: f32,
        view_a: &wgpu::TextureView,
        view_b: &wgpu::TextureView,
        out_view: &wgpu::TextureView,
    ) {
        let blend_uniform: [f32; 4] = [t, 0.0, 0.0, 0.0];
        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("visualizer_blend_uniforms"),
            contents: bytemuck::cast_slice(&blend_uniform),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("visualizer_blend_bind_group"),
            layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(view_a),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(view_b),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::Sampler(sampler),
                },
            ],
        });
        run_fullscreen_pass(device, queue, pipeline, &bind_group, out_view);
    }

    /// Copy a pool texture back to the CPU as tightly-packed RGBA8 bytes.
    fn readback(&self, idx: usize, width: u32, height: u32) -> Vec<u8> {
        let unpadded_bytes_per_row = width * 4;
        let padded_bytes_per_row = align_up(unpadded_bytes_per_row, 256);
        let buffer_size = u64::from(padded_bytes_per_row) * u64::from(height);

        let output_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("visualizer_readback"),
            size: buffer_size,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("visualizer_readback_encoder"),
            });
        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture: &self.texture_pool.textures[idx],
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
        self.queue.submit(Some(encoder.finish()));

        let slice = output_buffer.slice(..);
        slice.map_async(wgpu::MapMode::Read, |_| {});
        let _ = self.device.poll(wgpu::PollType::Wait);

        let data = slice.get_mapped_range();
        let mut pixels = Vec::with_capacity((width * height * 4) as usize);
        for row in 0..height {
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
    id: u64,
    glsl_source: String,
) -> Vec<u8> {
    let mut state = shader_state.lock().expect("shader state lock poisoned");
    state.compile_shader(id, &glsl_source).encode_to_vec()
}

/// Return the built-in visualizers as prost-encoded `Visualizer` messages so
/// the frontend can list and clone them.
#[tauri::command]
pub fn get_builtin_visualizers() -> Vec<Vec<u8>> {
    BUILTIN_VISUALIZERS
        .iter()
        .map(|b| {
            Visualizer {
                id: b.id,
                name: b.name.to_string(),
                glsl_source: b.glsl_source.to_string(),
                is_builtin: true,
            }
            .encode_to_vec()
        })
        .collect()
}

/// Queue a compiled visualizer for removal. Takes effect after the current
/// render completes.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn delete_visualizer(shader_state: State<'_, Arc<Mutex<ShaderState>>>, id: u64) {
    let mut state = shader_state.lock().expect("shader state lock poisoned");
    state.mark_for_deletion(id);
}

fn align_up(value: u32, alignment: u32) -> u32 {
    value.div_ceil(alignment) * alignment
}

/// Returns the texture view for a pool index, or the black view for `BLACK_IDX`.
fn view_for<'a>(
    pool: &'a TexturePool,
    black_view: &'a wgpu::TextureView,
    idx: usize,
) -> &'a wgpu::TextureView {
    if idx == BLACK_IDX {
        black_view
    } else {
        &pool.views[idx]
    }
}

fn run_fullscreen_pass(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    pipeline: &wgpu::RenderPipeline,
    bind_group: &wgpu::BindGroup,
    out_view: &wgpu::TextureView,
) {
    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("visualizer_pass_encoder"),
    });
    {
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
        pass.set_pipeline(pipeline);
        pass.set_bind_group(0, bind_group, &[]);
        pass.draw(0..3, 0..1);
    }
    queue.submit(Some(encoder.finish()));
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
const VERTEX_WGSL: &str = r"
@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> @builtin(position) vec4<f32> {
    var p = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );
    return vec4<f32>(p[idx], 0.0, 1.0);
}
";

/// Blend two textures by `u_t.x`. Used for Lerp nodes.
const BLEND_WGSL: &str = r"
@group(0) @binding(0) var<uniform> u_t: vec4<f32>;
@group(0) @binding(1) var t_a: texture_2d<f32>;
@group(0) @binding(2) var t_b: texture_2d<f32>;
@group(0) @binding(3) var s_linear: sampler;

@fragment
fn fs_main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let dims = vec2<f32>(textureDimensions(t_a));
    let uv = pos.xy / dims;
    let a = textureSample(t_a, s_linear, uv);
    let b = textureSample(t_b, s_linear, uv);
    return mix(a, b, u_t.x);
}
";
