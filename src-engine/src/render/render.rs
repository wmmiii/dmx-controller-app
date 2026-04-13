use std::fmt;
use std::sync::{LazyLock, Mutex};

use crate::{
    project,
    proto::{
        Color, ColorPalette, FixtureState, OutputTarget, Project, RenderMode, WledRenderTarget,
        fixture_state::LightColor,
        output::Output,
        output_target,
        render_mode::{GroupDebug, Mode, Scene},
        wled_render_target::Segment,
    },
    render::{
        dmx_render_target::DmxRenderTarget, render_target::RenderTarget, scene::render_scene,
        util::get_fixtures,
    },
};

/// Errors that can occur during rendering.
#[derive(Debug, Clone)]
pub enum RenderError {
    /// The specified output was not found in the current patch.
    /// This can happen when an output is deleted but the render loop hasn't stopped yet.
    OutputNotFound { output_id: u64, patch_id: u64 },
    /// The output exists but is not the expected type (e.g., expected DMX but got WLED).
    WrongOutputType,
    /// Fixture definitions are not available.
    MissingFixtureDefinitions,
    /// Failed to acquire a lock on shared state.
    LockError(String),
    /// Scene rendering error.
    SceneError(String),
}

impl fmt::Display for RenderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::OutputNotFound {
                output_id,
                patch_id,
            } => {
                write!(f, "Could not find output {output_id} for patch {patch_id}")
            }
            Self::WrongOutputType => write!(f, "Output is not the expected type"),
            Self::MissingFixtureDefinitions => write!(f, "Fixture definitions not defined"),
            Self::LockError(msg) => write!(f, "Failed to lock: {msg}"),
            Self::SceneError(msg) => write!(f, "Scene error: {msg}"),
        }
    }
}

impl std::error::Error for RenderError {}

impl From<String> for RenderError {
    fn from(s: String) -> Self {
        Self::LockError(s)
    }
}

/// Global static render mode instance
/// Can be accessed from both WASM and Tauri contexts
pub static RENDER_MODE_REF: LazyLock<Mutex<RenderMode>> =
    LazyLock::new(|| Mutex::new(RenderMode::default()));

pub fn render_dmx(output_id: u64, system_t: u64, frame: u32) -> Result<[u8; 512], RenderError> {
    // Use nested Result to carry RenderError through the String-based with_project
    let nested_result: Result<Result<[u8; 512], RenderError>, String> =
        project::with_project(|project| {
            let fixtures = match project
                .patches
                .get(&project.active_patch)
                .and_then(|p| p.outputs.get(&output_id))
                .and_then(|o| o.output.as_ref())
            {
                Some(Output::SerialDmxOutput(serial)) => &serial.fixtures,
                Some(Output::SacnDmxOutput(sacn)) => &sacn.fixtures,
                Some(_) => return Ok(Err(RenderError::WrongOutputType)),
                None => {
                    return Ok(Err(RenderError::OutputNotFound {
                        output_id,
                        patch_id: project.active_patch,
                    }));
                }
            };

            let Some(fixture_definitions) = project
                .fixture_definitions
                .as_ref()
                .map(|d| &d.dmx_fixture_definitions)
            else {
                return Ok(Err(RenderError::MissingFixtureDefinitions));
            };

            let mut render_target = DmxRenderTarget::new(fixtures, fixture_definitions);

            Ok(
                render(output_id, &mut render_target, system_t, frame, project)
                    .map(|()| render_target.get_universe()),
            )
        });

    // Flatten: String error -> RenderError::LockError, then unwrap inner Result
    nested_result.map_err(RenderError::LockError)?
}

pub fn render_wled(
    output_id: u64,
    system_t: u64,
    frame: u32,
) -> Result<WledRenderTarget, RenderError> {
    // Use nested Result to carry RenderError through the String-based with_project
    let nested_result: Result<Result<WledRenderTarget, RenderError>, String> =
        project::with_project(|project| {
            let wled_output = match project
                .patches
                .get(&project.active_patch)
                .and_then(|p| p.outputs.get(&output_id))
                .and_then(|o| o.output.as_ref())
            {
                Some(Output::WledOutput(output)) => output,
                Some(_) => return Ok(Err(RenderError::WrongOutputType)),
                None => {
                    return Ok(Err(RenderError::OutputNotFound {
                        output_id,
                        patch_id: project.active_patch,
                    }));
                }
            };

            let mut render_target = WledRenderTarget {
                id: output_id,
                segments: wled_output
                    .segments
                    .iter()
                    .map(|_| Segment {
                        effect: 0,
                        palette: 0,
                        primary_color: Some(crate::proto::wled_render_target::Color {
                            red: 0.0,
                            green: 0.0,
                            blue: 0.0,
                        }),
                        speed: 1.0,
                        brightness: 1.0,
                    })
                    .collect(),
            };

            Ok(
                render(output_id, &mut render_target, system_t, frame, project)
                    .map(|()| render_target),
            )
        });

    // Flatten: String error -> RenderError::LockError, then unwrap inner Result
    nested_result.map_err(RenderError::LockError)?
}

fn render<T: RenderTarget<T>>(
    output_id: u64,
    render_target: &mut T,
    system_t: u64,
    frame: u32,
    project: &Project,
) -> Result<(), RenderError> {
    let render_mode = RENDER_MODE_REF
        .lock()
        .map_err(|e| RenderError::LockError(e.to_string()))?;

    match &render_mode.mode {
        None | Some(Mode::Blackout(_)) => Ok(()),
        Some(Mode::FixtureDebug(fixture_debug)) => {
            if output_id == fixture_debug.output_id {
                render_target.apply_fixture_debug(fixture_debug);
            }
            Ok(())
        }
        Some(Mode::GroupDebug(GroupDebug { group_id })) => {
            render_group_debug(render_target, project, *group_id);
            Ok(())
        }
        Some(Mode::Scene(Scene { scene_id })) => {
            render_scene(*scene_id, render_target, system_t, frame, project)
                .map_err(RenderError::SceneError)
        }
        Some(Mode::Show(_)) => todo!("Show not implemented yet!"),
    }
}

fn render_group_debug<T: RenderTarget<T>>(render_target: &mut T, project: &Project, group_id: u64) {
    let group_target = OutputTarget {
        output: Some(output_target::Output::Group(group_id)),
    };
    let fixtures = get_fixtures(project, &group_target);
    for (fixture_id, info) in &fixtures {
        // Use phase for hue (already normalized to [0, 1) range)
        let h = info.phase;

        // Scale to [0, 6) to represent the 6 segments of the color wheel
        let h_scaled = h * 6.0;
        #[allow(clippy::cast_possible_truncation)]
        let segment = h_scaled.floor() as i32;
        let f = h_scaled - f64::from(segment);

        let color = match segment {
            0 => (1.0, f, 0.0),       // Red to Yellow
            1 => (1.0 - f, 1.0, 0.0), // Yellow to Green
            2 => (0.0, 1.0, f),       // Green to Cyan
            3 => (0.0, 1.0 - f, 1.0), // Cyan to Blue
            4 => (f, 0.0, 1.0),       // Blue to Magenta
            _ => (1.0, 0.0, 1.0 - f), // Magenta to Red (segment 5 or wraparound)
        };

        let state = FixtureState {
            light_color: Some(LightColor::Color(Color {
                red: color.0,
                green: color.1,
                blue: color.2,
                white: None,
            })),
            ..Default::default()
        };

        render_target.apply_state(fixture_id, &state, &ColorPalette::default());
    }
}
