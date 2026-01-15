use std::sync::Mutex;

use once_cell::sync::Lazy;

use crate::{
    project::PROJECT_REF,
    proto::{
        fixture_state::LightColor,
        output::Output,
        output_target,
        render_mode::{GroupDebug, Mode, Scene},
        wled_render_target::Segment,
        Color, ColorPalette, FixtureState, OutputTarget, Project, RenderMode, WledRenderTarget,
    },
    render::{
        dmx_render_target::DmxRenderTarget, render_target::RenderTarget, scene::render_scene,
        util::get_fixtures,
    },
};

/// Global static render mode instance
/// Can be accessed from both WASM and Tauri contexts
pub static RENDER_MODE_REF: Lazy<Mutex<RenderMode>> =
    Lazy::new(|| Mutex::new(RenderMode::default()));

pub fn render_dmx(output_id: u64, system_t: u64, frame: u32) -> Result<[u8; 512], String> {
    let project = PROJECT_REF
        .lock()
        .map_err(|e| format!("Failed to lock project: {}", e))?;

    let fixtures = match project
        .patches
        .get(&project.active_patch)
        .and_then(|p| p.outputs.get(&output_id))
        .and_then(|o| o.output.as_ref())
    {
        Some(Output::SerialDmxOutput(serial)) => &serial.fixtures,
        Some(Output::SacnDmxOutput(sacn)) => &sacn.fixtures,
        Some(_) => return Err("Output specified not DMX!".to_string()),
        None => {
            return Err(format!(
                "Could not find output {} for patch {}",
                output_id, project.active_patch
            ))
        }
    };

    let fixture_definitions = match project
        .fixture_definitions
        .as_ref()
        .map(|d| &d.dmx_fixture_definitions)
    {
        Some(fixture_definitions) => fixture_definitions,
        None => return Err("Fixture definitions not defined!".to_string()),
    };

    let mut render_target = DmxRenderTarget::new(&fixtures, fixture_definitions);

    render(output_id, &mut render_target, system_t, frame, &project)
        .map(|_| render_target.get_universe())
}

pub fn render_wled(output_id: u64, system_t: u64, frame: u32) -> Result<WledRenderTarget, String> {
    let project = PROJECT_REF
        .lock()
        .map_err(|e| format!("Failed to lock project: {}", e))?;

    let wled_output = match project
        .patches
        .get(&project.active_patch)
        .and_then(|p| p.outputs.get(&output_id))
        .and_then(|o| o.output.as_ref())
    {
        Some(Output::WledOutput(output)) => output,
        Some(_) => return Err("Output specified not WLED!".to_string()),
        None => {
            return Err(format!(
                "Could not find output {} for patch {}",
                output_id, project.active_patch
            ))
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

    render(output_id, &mut render_target, system_t, frame, &project).map(|_| render_target)
}

fn render<T: RenderTarget<T>>(
    output_id: u64,
    render_target: &mut T,
    system_t: u64,
    frame: u32,
    project: &Project,
) -> Result<(), String> {
    let render_mode = RENDER_MODE_REF
        .lock()
        .map_err(|e| format!("Failed to lock render mode: {}", e))?;

    match &render_mode.mode {
        None | Some(Mode::Blackout(_)) => Ok(()),
        Some(Mode::FixtureDebug(fixture_debug)) => {
            if output_id == fixture_debug.output_id {
                render_target.apply_fixture_debug(&fixture_debug);
            }
            Ok(())
        }
        Some(Mode::GroupDebug(GroupDebug { group_id })) => {
            render_group_debug(render_target, project, group_id)
        }
        Some(Mode::Scene(Scene { scene_id })) => {
            render_scene(*scene_id, render_target, system_t, frame, project)
        }
        Some(Mode::Show(_)) => todo!("Show not implemented yet!"),
    }
}

fn render_group_debug<T: RenderTarget<T>>(
    render_target: &mut T,
    project: &Project,
    group_id: &u64,
) -> Result<(), String> {
    let group_target = OutputTarget {
        output: Some(output_target::Output::Group(*group_id)),
    };
    let fixtures = get_fixtures(project, &group_target);
    for (index, fixture) in fixtures.iter().enumerate() {
        // Normalize hue to [0, 1) range (handle wraparound)
        let h = index as f64 / fixtures.len() as f64;

        // Scale to [0, 6) to represent the 6 segments of the color wheel
        let h_scaled = h * 6.0;
        let segment = h_scaled.floor() as i32;
        let f = h_scaled - segment as f64;

        let color = match segment {
            0 => (1.0, f, 0.0),       // Red to Yellow
            1 => (1.0 - f, 1.0, 0.0), // Yellow to Green
            2 => (0.0, 1.0, f),       // Green to Cyan
            3 => (0.0, 1.0 - f, 1.0), // Cyan to Blue
            4 => (f, 0.0, 1.0),       // Blue to Magenta
            _ => (1.0, 0.0, 1.0 - f), // Magenta to Red (segment 5 or wraparound)
        };

        let mut state = FixtureState::default();
        state.light_color = Some(LightColor::Color(Color {
            red: color.0,
            green: color.1,
            blue: color.2,
            white: None,
        }));

        render_target.apply_state(fixture, &state, &ColorPalette::default());
    }

    Ok(())
}
