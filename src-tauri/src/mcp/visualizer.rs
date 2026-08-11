use std::sync::{Arc, Mutex};

use base64::Engine;
use dmx_engine::project;
use dmx_engine::project_util::rand_id;
use dmx_engine::proto::{Visualizer, VisualizerNode};
use dmx_engine::visualizer::builtin::{BUILTIN_VISUALIZERS, is_builtin};
use dmx_engine::visualizer::uniforms::ShaderUniforms;
use dmx_engine::visualizer::utils as visualizer_utils;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{CallToolResult, ContentBlock};
use rmcp::schemars::{self, JsonSchema};
use rmcp::{ErrorData, tool, tool_router};
use serde::Deserialize;
use serde_json::{Value, json};
use tauri::Manager;

use super::AppMcp;
use super::utils::{self, json_result};
use crate::shader::ShaderState;

/// Visualizer-specific helpers on the shared [`AppMcp`] server.
impl AppMcp {
    fn shader_state(&self) -> Result<Arc<Mutex<ShaderState>>, ErrorData> {
        self.app
            .try_state::<Arc<Mutex<ShaderState>>>()
            .map(|s| s.inner().clone())
            .ok_or_else(|| ErrorData::internal_error("Shader engine not initialized", None))
    }

    /// Compile-check GLSL in both the Rust (naga) engine and, best-effort, the
    /// app's browser (WebGL2) preview — the two renderers a saved shader has to
    /// run in. Returns `(overall_success, report)` where `report` is
    /// `{ rust, webgl }`. An unreachable webview is reported as unchecked rather
    /// than failing the whole compile, so an agent can still work with the app
    /// closed.
    async fn compile(&self, glsl_source: &str) -> Result<(bool, Value), ErrorData> {
        let rust = ShaderState::validate_shader(glsl_source);

        let webgl = super::bridge::compile_visualizer(&self.app, glsl_source).await;

        let (webgl_json, webgl_ok) = match &webgl {
            Ok(v) => {
                let ok = v.get("success").and_then(Value::as_bool).unwrap_or(false);
                (
                    json!({
                        "checked": true,
                        "success": ok,
                        "error_message": v.get("error_message"),
                        "error_line": v.get("error_line"),
                    }),
                    ok,
                )
            }
            Err(_) => (json!({ "checked": false }), true),
        };

        let success = rust.success && webgl_ok;
        let report = json!({
            "rust": {
                "success": rust.success,
                "error_message": rust.error_message,
                "error_line": rust.error_line,
            },
            "webgl": webgl_json,
        });
        Ok((success, report))
    }
}

/// Optimistic-concurrency tag for a visualizer: a content hash of its GLSL
/// source. `update_visualizer` requires the caller to echo the `etag` it last
/// read, and rejects the write if the stored source has changed since — so a
/// stale edit can't silently clobber a concurrent change made in the app.
fn etag(glsl_source: &str) -> String {
    sha256::digest(glsl_source)[..16].to_string()
}

#[derive(Debug, Deserialize, JsonSchema)]
struct GetVisualizerParams {
    /// Visualizer id, as returned by `list_visualizers`.
    id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct CreateVisualizerParams {
    /// Display name for the new visualizer.
    name: String,
    /// GLSL source defining `vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel)`.
    /// Omit to seed the visualizer with the default template, which documents the
    /// available engine uniforms.
    #[serde(default)]
    glsl_source: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct UpdateVisualizerParams {
    /// Id of the existing user visualizer to update.
    id: String,
    /// The `etag` you last read for this visualizer (from `get_visualizer`,
    /// `create_visualizer`, or a prior `update_visualizer`). The update is
    /// rejected if the stored source has changed since — re-read and reapply.
    etag: String,
    /// New GLSL source defining `vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel)`.
    glsl_source: String,
    /// New display name. Omit to leave the name unchanged.
    #[serde(default)]
    name: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct DeleteVisualizerParams {
    /// Visualizer id to delete.
    id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
struct PreviewVisualizerParams {
    /// Id of the visualizer to render (user or built-in), as returned by
    /// `list_visualizers`. Renders whatever source is currently saved, so
    /// `update_visualizer` first, then preview to see the result.
    id: String,
    /// Preview width in pixels (default 128, clamped to 8..=512).
    #[serde(default)]
    width: Option<u32>,
    /// Preview height in pixels (default 128, clamped to 8..=512).
    #[serde(default)]
    height: Option<u32>,
    /// Beat phase 0..1 to sample for `u_beat_t` (default 0).
    #[serde(default)]
    beat_t: Option<f32>,
    /// Time in milliseconds to sample for `u_time_ms` (default 0).
    #[serde(default)]
    time_ms: Option<u32>,
}

/// Tools for reading and editing the visualizers of the currently open project.
#[tool_router(router = visualizer_router, vis = "pub(super)")]
impl AppMcp {
    #[tool(
        description = "Explain how visualizers work in this app: what they are, the GLSL entry point, the engine uniforms available, and the editing workflow. Call this before creating or editing a visualizer."
    )]
    #[allow(clippy::unused_self)]
    fn visualizer_info(&self) -> Result<CallToolResult, ErrorData> {
        json_result(&json!({
            "overview": "Visualizers are GLSL fragment shaders that render animated content onto pixel-mapped light fixtures. Each defines the entry point below, returning the color for one pixel. Multiple visualizers can be stacked on a fixture; they render as a sequence, each compositing over the ones below (see prev_pixel).",
            "entry_point": "vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel)",
            "coordinates": "uv and frag_coord are y-up. uv.x = 0.0 is the LEFT edge, 1.0 the RIGHT edge. uv.y = 0.0 is the BOTTOM edge, 1.0 the TOP edge (y increases upward). frag_coord = uv * u_resolution and shares the origin: frag_coord (0,0) is the bottom-left pixel. Shaders that 'grow up from the bottom' should increase with uv.y.",
            "output": "Return a vec4. Its alpha composites the shader's color over prev_pixel: the engine emits `mix(prev_pixel.rgb, rgb, clamp(alpha,0,1))`. Return `vec4(color, 1.0)` for fully opaque (the convention); a lower alpha fades toward prev_pixel. Equivalently you can read prev_pixel and blend by hand, returning alpha = 1.0 — use whichever is clearer. Fixtures are RGB, so only the composited color is emitted (alpha is consumed by this step, not output).",
            "prev_pixel": "The layer beneath this shader. When visualizers are stacked on a fixture they render as a sequence, and prev_pixel is the previous visualizer's output; for the first (or only) visualizer it is instead the previous rendered FRAME for this display (temporal feedback), or black on the first frame. Read it directly (trails, feedback, hue-shifting the layer below), or let a returned alpha < 1 composite over it. Note: for the first/only visualizer prev_pixel is the previous frame, so a constant alpha < 1 there trails/fades in over successive frames. Caveat: the human's in-app editor preview (not `preview_visualizer`) shows a single shader with a CHECKERBOARD placeholder for prev_pixel; `preview_visualizer` renders through the engine, where prev_pixel starts black.",
            "workflow": "Edit iteratively with `update_visualizer`: it compile-gates every write in BOTH the Rust engine and the browser WebGL2 preview and refuses to save invalid source, so a successful save is your compile check — save small, frequent changes rather than batching. Each save applies live to the open project (the user watches it update in real time) and lands on the shared undo stack. `update_visualizer` requires the `etag` you last read so a concurrent user edit can't be clobbered; on a mismatch, re-read with `get_visualizer` and reapply. `create_visualizer` compile-gates the same way. Built-in visualizers are read-only.",
            "preview_note": "Use `preview_visualizer` with a visualizer id to render the CURRENTLY SAVED source through the app engine (the same renderer that drives real fixtures) and get an image back — this is how you SEE a shader, so `update_visualizer` first, then preview. It uses a fixed default palette and zero audio, so audio-reactive shaders look static; sample motion via beat_t/time_ms.",
            "template": visualizer_utils::DEFAULT_VISUALIZER_GLSL,
            "shadertoy": {
                "reference": "Shadertoy (https://www.shadertoy.com/) is a good source of shader ideas. Use `preview_visualizer` to see your port rendered; you can also have the user preview the original on Shadertoy to compare.",
                "porting": "You cannot fetch a Shadertoy page programmatically — ask the user to paste the shader source. Then adapt Shadertoy's conventions to this engine before validating:",
                "mapping": [
                    "Entry point: `void mainImage(out vec4 fragColor, in vec2 fragCoord)` becomes `vec4 visualizer(vec2 uv, vec2 frag_coord, vec4 prev_pixel)` — return the color instead of writing to `fragColor`.",
                    "`fragCoord` -> `frag_coord`; `iResolution.xy` -> `u_resolution`.",
                    "`iTime` (seconds) -> `u_time_ms / 1000.0`.",
                    "uv orientation matches Shadertoy: both are y-up (uv.y = 0 at the bottom), so no vertical flip is normally needed. If a port comes out upside down, add `uv.y = 1.0 - uv.y`.",
                    "No equivalent exists for `iMouse`, `iFrame`, `iDate`, `iSampleRate`, or texture/buffer channels (`iChannel0..3`); multi-pass (Buffer A/B/...) shaders cannot be ported directly — flag these to the user. Drive animation from `u_beat_t`/`u_audio_bands` and color from `u_palette_*` instead.",
                ],
            },
        }))
    }

    #[tool(
        description = "List visualizers in the current project. Returns user visualizers plus read-only built-ins, each as { id, name, is_builtin }."
    )]
    #[allow(clippy::unused_self)]
    fn list_visualizers(&self) -> Result<CallToolResult, ErrorData> {
        // Stable order (user before built-in, then by name) so repeated calls and
        // diffs don't churn on the maps' arbitrary iteration order.
        let mut user = project::with_project(|p| {
            Ok(p.visualizers
                .iter()
                .map(|(id, v)| (v.name.clone(), id.to_string()))
                .collect::<Vec<(String, String)>>())
        })
        .map_err(|e| ErrorData::internal_error(e, None))?;
        user.sort();

        let mut builtin = BUILTIN_VISUALIZERS
            .iter()
            .map(|(id, b)| (b.name.to_string(), id.to_string()))
            .collect::<Vec<(String, String)>>();
        builtin.sort();

        let items = user
            .into_iter()
            .map(|(name, id)| json!({ "id": id, "name": name, "is_builtin": false }))
            .chain(
                builtin
                    .into_iter()
                    .map(|(name, id)| json!({ "id": id, "name": name, "is_builtin": true })),
            )
            .collect::<Vec<Value>>();

        json_result(&json!(items))
    }

    #[tool(
        description = "Get the name and GLSL source of one visualizer by id (user or built-in)."
    )]
    #[allow(clippy::unused_self)]
    fn get_visualizer(
        &self,
        Parameters(params): Parameters<GetVisualizerParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let id = parse_id(&params.id)?;

        if let Some(builtin) = BUILTIN_VISUALIZERS.get(&id) {
            return json_result(&json!({
                "id": params.id,
                "name": builtin.name,
                "glsl_source": builtin.glsl_source,
                "etag": etag(builtin.glsl_source),
                "is_builtin": true,
            }));
        }

        let found = project::with_project(|p| {
            Ok(p.visualizers
                .get(&id)
                .map(|v| (v.name.clone(), v.glsl_source.clone())))
        })
        .map_err(|e| ErrorData::internal_error(e, None))?;

        match found {
            Some((name, glsl_source)) => json_result(&json!({
                "id": params.id,
                "name": name,
                "etag": etag(&glsl_source),
                "glsl_source": glsl_source,
                "is_builtin": false,
            })),
            None => Err(ErrorData::invalid_params(
                format!("No visualizer with id {}", params.id),
                None,
            )),
        }
    }

    #[tool(
        description = "Create a new visualizer in the current project with the default template which documents the available engine uniforms; the saved source and its `etag` are returned so you can build on it (pass the etag to `update_visualizer`)."
    )]
    async fn create_visualizer(
        &self,
        Parameters(params): Parameters<CreateVisualizerParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let glsl_source = params
            .glsl_source
            .unwrap_or_else(|| visualizer_utils::DEFAULT_VISUALIZER_GLSL.to_string());

        // Compile-gate in both engines: never persist invalid GLSL.
        let (success, compilation) = self.compile(&glsl_source).await?;
        if !success {
            return json_result(&json!({
                "saved": false,
                "success": false,
                "compilation": compilation,
            }));
        }

        let id = rand_id();
        let visualizer = Visualizer {
            name: params.name.clone(),
            glsl_source: glsl_source.clone(),
        };
        utils::ai_save(
            &self.app,
            &format!("Create visualizer \"{}\"", params.name),
            move |p| {
                p.visualizers.insert(id, visualizer);
                Ok(())
            },
        )
        .await?;

        json_result(&json!({
            "saved": true,
            "success": true,
            "id": id.to_string(),
            "name": params.name,
            "etag": etag(&glsl_source),
            "glsl_source": glsl_source,
        }))
    }

    #[tool(
        description = "Update an existing user visualizer's GLSL (and optionally its name). Requires the `etag` you last read for it; the write is rejected if the stored source changed since (a concurrent user edit), so re-read with `get_visualizer` and reapply on mismatch. Compile-gates the GLSL in both the Rust engine and the browser WebGL2 preview and refuses to save if either fails. Returns the new `etag`. Built-in visualizers are read-only."
    )]
    async fn update_visualizer(
        &self,
        Parameters(params): Parameters<UpdateVisualizerParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let id = parse_id(&params.id)?;
        if is_builtin(id) {
            return Err(ErrorData::invalid_params(
                "Built-in visualizers are read-only and cannot be modified",
                None,
            ));
        }

        // Compile-gate in both engines: never persist invalid GLSL.
        let (success, compilation) = self.compile(&params.glsl_source).await?;
        if !success {
            return json_result(&json!({
                "saved": false,
                "success": false,
                "compilation": compilation,
            }));
        }

        // Resolve the final name up front: keep the existing one unless renamed.
        let existing_name =
            project::with_project(|p| Ok(p.visualizers.get(&id).map(|v| v.name.clone())))
                .map_err(|e| ErrorData::internal_error(e, None))?
                .ok_or_else(|| {
                    ErrorData::invalid_params(format!("No user visualizer with id {id}"), None)
                })?;
        let name = params.name.unwrap_or(existing_name);

        let new_glsl = params.glsl_source;
        let new_etag = etag(&new_glsl);
        let expected_etag = params.etag;

        let visualizer = Visualizer {
            name: name.clone(),
            glsl_source: new_glsl.clone(),
        };
        // The etag check and the write share ai_save's single project lock, so a
        // concurrent user edit can't slip in between them (optimistic concurrency).
        utils::ai_save(
            &self.app,
            &format!("Update visualizer \"{name}\""),
            move |p| {
                let current = p
                    .visualizers
                    .get(&id)
                    .ok_or_else(|| format!("No user visualizer with id {id}"))?;
                let current_etag = etag(&current.glsl_source);
                if current_etag != expected_etag {
                    return Err(format!(
                        "Visualizer changed since you last read it (current etag {current_etag}, \
                         you sent {expected_etag}); re-read it with get_visualizer and reapply your edit."
                    ));
                }
                p.visualizers.insert(id, visualizer);
                Ok(())
            },
        )
        .await?;

        json_result(&json!({
            "saved": true,
            "success": true,
            "id": id.to_string(),
            "name": name,
            "etag": new_etag,
        }))
    }

    #[tool(
        description = "Delete a user visualizer from the current project by id. Also strips the visualizer from every effect that references it. Built-in visualizers cannot be deleted."
    )]
    async fn delete_visualizer(
        &self,
        Parameters(params): Parameters<DeleteVisualizerParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let id = parse_id(&params.id)?;
        if is_builtin(id) {
            return Err(ErrorData::invalid_params(
                "Built-in visualizers are read-only and cannot be deleted",
                None,
            ));
        }

        utils::ai_save(&self.app, &format!("Delete visualizer {id}"), move |p| {
            if !visualizer_utils::delete_visualizer(p, id) {
                return Err(format!("No user visualizer with id {id}"));
            }
            Ok(())
        })
        .await?;

        json_result(&json!({ "deleted": true, "id": params.id }))
    }

    #[tool(
        description = "Render a saved visualizer (by id, user or built-in) through the app's engine — the same renderer that drives real fixtures — and return the image so you can SEE the shader. Renders whatever source is currently saved, so `update_visualizer` first, then preview. Requires the app to be open. The palette uses fixed defaults (primary=red, secondary=green, tertiary=blue) and audio bands are 0, so sample motion via `beat_t`/`time_ms` and expect audio-reactive shaders to look static. Does not save anything. For compile errors, `update_visualizer` reports them."
    )]
    async fn preview_visualizer(
        &self,
        Parameters(params): Parameters<PreviewVisualizerParams>,
    ) -> Result<CallToolResult, ErrorData> {
        let id = parse_id(&params.id)?;
        let width = params.width.unwrap_or(128).clamp(8, 512);
        let height = params.height.unwrap_or(128).clamp(8, 512);
        let beat_t = params.beat_t.unwrap_or(0.0);
        let time_ms = params.time_ms.unwrap_or(0);

        let glsl_source = if let Some(builtin) = BUILTIN_VISUALIZERS.get(&id) {
            builtin.glsl_source.to_string()
        } else {
            project::with_project(|p| Ok(p.visualizers.get(&id).map(|v| v.glsl_source.clone())))
                .map_err(|e| ErrorData::internal_error(e, None))?
                .ok_or_else(|| {
                    ErrorData::invalid_params(format!("No visualizer with id {}", params.id), None)
                })?
        };

        let shader_state = self.shader_state()?;
        // Readback blocks on GPU work; keep it off the async executor threads.
        let png = tokio::task::block_in_place(|| {
            render_preview(&shader_state, &glsl_source, width, height, beat_t, time_ms)
        })?;

        let data = base64::engine::general_purpose::STANDARD.encode(&png);
        Ok(CallToolResult::success(vec![
            ContentBlock::text("Rendered by the app engine (default palette, audio = 0)."),
            ContentBlock::image(data, "image/png"),
        ]))
    }
}

/// Render one frame of `glsl` through the engine and return PNG bytes. Uses a
/// dedicated preview shader/display id so it never disturbs real outputs.
fn render_preview(
    shader_state: &Arc<Mutex<ShaderState>>,
    glsl: &str,
    width: u32,
    height: u32,
    beat_t: f32,
    time_ms: u32,
) -> Result<Vec<u8>, ErrorData> {
    const PREVIEW_SHADER_ID: u64 = u64::MAX;
    const PREVIEW_DISPLAY_ID: u64 = u64::MAX;

    let mut state = shader_state
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);

    let compilation = state.compile_shader(PREVIEW_SHADER_ID, glsl);
    if !compilation.success {
        return Err(ErrorData::invalid_params(
            format!(
                "Shader failed to compile (line {}): {}",
                compilation.error_line, compilation.error_message
            ),
            None,
        ));
    }

    let mut uniforms = ShaderUniforms::default();
    #[allow(clippy::cast_precision_loss)]
    uniforms.set_resolution(width as f32, height as f32);
    uniforms.color = [1.0, 1.0, 1.0];
    uniforms.beat_t = beat_t;
    uniforms.time_ms = time_ms;
    uniforms.palette_primary = [1.0, 0.2, 0.2];
    uniforms.palette_secondary = [0.2, 1.0, 0.2];
    uniforms.palette_tertiary = [0.2, 0.2, 1.0];

    let tree = VisualizerNode::leaf(PREVIEW_SHADER_ID);
    let rgba = state.render_and_readback(PREVIEW_DISPLAY_ID, &tree, &uniforms, width, height);

    encode_png(&rgba, width, height)
}

/// Encode row-major RGBA8 pixels as PNG bytes.
fn encode_png(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, ErrorData> {
    let mut buf = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut buf, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder
            .write_header()
            .map_err(|e| ErrorData::internal_error(format!("PNG encode failed: {e}"), None))?;
        writer
            .write_image_data(rgba)
            .map_err(|e| ErrorData::internal_error(format!("PNG encode failed: {e}"), None))?;
    }
    Ok(buf)
}

fn parse_id(id: &str) -> Result<u64, ErrorData> {
    id.parse::<u64>()
        .map_err(|_| ErrorData::invalid_params(format!("Invalid visualizer id: {id}"), None))
}
