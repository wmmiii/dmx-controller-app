// Declare submodules
pub mod dmx_render_target;
pub mod render_target;

use dmx_render_target::DmxRenderTarget;
use render_target::RenderTarget;

use crate::proto::{output::Output, Project, Scene, SerialDmxOutput};

pub fn render_live_dmx(project: &Project, output_id: u64) -> Result<[u8; 512], String> {
    let output: &SerialDmxOutput = match project
        .patches
        .get(&project.active_patch)
        .and_then(|p| p.outputs.get(&output_id))
        .and_then(|o| o.output.as_ref())
    {
        Some(Output::SerialDmxOutput(serial)) => serial,
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

    let scene = match project.scenes.get(&project.active_scene) {
        Some(scene) => scene,
        None => return Err(format!("Could not find scene {}", project.active_scene)),
    };

    let mut render_target = DmxRenderTarget::new(output, fixture_definitions);

    render_scene(scene, &mut render_target);

    return Ok(render_target.get_universe());
}

fn render_scene<T: RenderTarget<T>>(scene: &Scene, render_target: &mut T) {}
