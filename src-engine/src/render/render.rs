use std::sync::Mutex;

use once_cell::sync::Lazy;

use crate::{
    project::PROJECT_REF,
    proto::{
        output::Output,
        render_mode::{Mode, Scene},
        wled_render_target::{Color, Segment},
        Project, RenderMode, WledRenderTarget,
    },
    render::{
        dmx_render_target::DmxRenderTarget, render_target::RenderTarget, scene::render_scene,
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

    render(&mut render_target, system_t, frame, &project).map(|_| render_target.get_universe())
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
                primary_color: Some(Color {
                    red: 0.0,
                    green: 0.0,
                    blue: 0.0,
                }),
                speed: 1.0,
                brightness: 1.0,
            })
            .collect(),
    };

    render(&mut render_target, system_t, frame, &project).map(|_| render_target)
}

fn render<T: RenderTarget<T>>(
    render_target: &mut T,
    system_t: u64,
    frame: u32,
    project: &Project,
) -> Result<(), String> {
    let render_mode = RENDER_MODE_REF
        .lock()
        .map_err(|e| format!("Failed to lock render mode: {}", e))?;

    match render_mode.mode {
        None | Some(Mode::Blackout(_)) => Ok(()),
        Some(Mode::Scene(Scene { scene_id })) => {
            render_scene(scene_id, render_target, system_t, frame, project)
        }
        _ => Ok(()),
    }
}
