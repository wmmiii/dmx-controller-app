use std::collections::HashMap;

use crate::beat::{set_bpm, set_first_beat};
use crate::project;
use crate::proto::{self, InputBinding, InputType};
use crate::tile::{calculate_tile_strength, toggle_tile};

/// Result of performing a MIDI action
#[derive(Debug, Clone)]
pub struct ActionResult {
    /// Whether the project was modified
    pub modified: bool,
    /// Type of beat action to handle (None if not a beat action)
    pub action: Option<proto::input_binding::Action>,
}

impl ActionResult {
    fn unchanged() -> Self {
        Self {
            modified: false,
            action: None,
        }
    }

    fn with_action(action: proto::input_binding::Action, modified: bool) -> Self {
        Self {
            modified,
            action: Some(action),
        }
    }
}

/// The context for which we are finding a binding.
#[derive(Debug, Clone)]
pub enum BindingContext {
    LivePage,
    Scene { scene_id: u64 },
}

/// Control command type for 14-bit MIDI CC values
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ControlCommandType {
    Msb,
    Lsb,
}

/// Looks up a binding in the hierarchy, starting from scene and falling back to global.
fn find_binding<'a>(
    project: &'a proto::Project,
    binding_context: &BindingContext,
    binding_id: u64,
    channel: &str,
) -> Option<&'a InputBinding> {
    // Check scene bindings first
    if let BindingContext::Scene { scene_id } = binding_context
        && let Some(binding) = project
            .scenes
            .get(scene_id)
            .and_then(|scene| scene.controller_bindings.as_ref())
            .and_then(|map| map.bindings.get(&binding_id))
            .and_then(|bindings| bindings.bindings.get(channel))
    {
        return Some(binding);
    }

    // Fall back to global bindings
    if let Some(binding) = project
        .live_page_controller_bindings
        .as_ref()
        .and_then(|map| map.bindings.get(&binding_id))
        .and_then(|bindings| bindings.bindings.get(channel))
    {
        return Some(binding);
    }

    None
}

/// Performs a MIDI action on the project.
///
/// Returns information about whether the project was modified and if any beat
/// actions need to be handled by the Tauri layer.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
pub fn perform_action(
    binding_id: u64,
    channel: &str,
    value: f64,
    cct: Option<ControlCommandType>,
    t: u64,
) -> Result<ActionResult, String> {
    project::with_project_mut(|project| {
        // TODO: Use actual binding context.
        let binding_context = BindingContext::Scene {
            scene_id: project.active_scene,
        };

        let Some(&binding) = find_binding(project, &binding_context, binding_id, channel) else {
            return Ok(ActionResult::unchanged());
        };

        let action = &binding.action.unwrap();

        match action {
            proto::input_binding::Action::BeatMatch(_) => {
                // Only trigger on binary press (value > 0.5)
                if binding.input_type() == InputType::Binary && value > 0.5 {
                    Ok(ActionResult::with_action(*action, false))
                } else {
                    Ok(ActionResult::unchanged())
                }
            }
            proto::input_binding::Action::FirstBeat(_) => {
                // Only trigger on binary press (value > 0.5)
                if binding.input_type() == InputType::Binary && value > 0.5 {
                    set_first_beat(project).and(Ok(ActionResult::with_action(*action, false)))
                } else {
                    Ok(ActionResult::unchanged())
                }
            }
            proto::input_binding::Action::SetTempo(_) => {
                // Calculate BPM from fader value (80-207 BPM range)
                let bpm = (value * 127.0 + 80.0).floor() as u16;

                set_bpm(project, bpm).and(Ok(ActionResult::with_action(*action, true)))
            }
            proto::input_binding::Action::TileStrength(tile_action) => {
                let modified = perform_tile_strength(project, tile_action.tile_id, value, cct, t);
                Ok(ActionResult::with_action(*action, modified))
            }
            proto::input_binding::Action::ColorPalette(palette_action) => {
                if let Some(scene) = project.scenes.get_mut(&project.active_scene) {
                    scene.active_color_palette = palette_action.palette_id;
                    Ok(ActionResult::with_action(*action, true))
                } else {
                    Ok(ActionResult::unchanged())
                }
            }
        }
    })
}

/// Performs tile strength action - either sets absolute strength (fader) or toggles (button).
fn perform_tile_strength(
    project: &mut proto::Project,
    tile_id: u64,
    value: f64,
    cct: Option<ControlCommandType>,
    t: u64,
) -> bool {
    if let Some(scene) = project.scenes.get_mut(&project.active_scene)
        && let Some(tile_entry) = scene.tile_map.iter_mut().find(|tm| tm.id == tile_id)
        && let Some(tile) = tile_entry.tile.as_mut()
    {
        #[allow(clippy::cast_possible_truncation)]
        if cct.is_some() {
            // Fader input - set absolute strength
            tile.transition = Some(proto::scene::tile::Transition::AbsoluteStrength(
                value as f32,
            ));
            true
        } else if value > 0.5 {
            // Binary input - toggle tile
            let beat = match &project.live_beat {
                Some(b) => *b,
                None => return false,
            };
            toggle_tile(tile, &beat, t);
            true
        } else {
            false
        }
    } else {
        false
    }
}

pub fn calculate_midi_output(
    controller_name: &str,
    t: u64,
) -> Result<HashMap<String, f64>, String> {
    project::with_project(|project| {
        let mut output = HashMap::new();

        if controller_name.is_empty() {
            return Ok(output);
        }

        // Look up binding ID from controller name
        let Some((binding_id, beat_metadata)) = project
            .controller_mapping
            .as_ref()
            .and_then(|mapping| mapping.controller_to_binding.get(controller_name))
            .zip(project.live_beat.as_ref())
        else {
            return Ok(output);
        };

        #[allow(clippy::cast_precision_loss)]
        let beat_t = (t - beat_metadata.offset_ms) as f64 / beat_metadata.length_ms;

        // Collect bindings from both global and scene contexts
        let mut all_bindings = HashMap::new();

        // First, add global bindings
        if let Some(global_bindings) = project
            .live_page_controller_bindings
            .as_ref()
            .and_then(|map| map.bindings.get(binding_id))
        {
            for (channel, binding) in &global_bindings.bindings {
                all_bindings.insert(channel.clone(), *binding);
            }
        }

        // Then, add/override with scene-specific bindings
        if let Some(scene_bindings) = project
            .scenes
            .get(&project.active_scene)
            .and_then(|scene| scene.controller_bindings.as_ref())
            .and_then(|map| map.bindings.get(binding_id))
        {
            for (channel, binding) in &scene_bindings.bindings {
                all_bindings.insert(channel.clone(), *binding);
            }
        }

        // Calculate output values for all bindings
        for (channel, binding) in &all_bindings {
            let value = match &binding.action {
                Some(proto::input_binding::Action::BeatMatch(_)) => 1.0 - (beat_t % 1.0).round(),
                Some(proto::input_binding::Action::FirstBeat(_)) => {
                    1.0 - ((beat_t % 4.0) / 4.0).round()
                }
                Some(proto::input_binding::Action::SetTempo(_)) => {
                    (60_000.0 / beat_metadata.length_ms - 80.0) / 127.0
                }
                Some(proto::input_binding::Action::TileStrength(tile_action)) => {
                    calculate_tile_strength(project, tile_action.tile_id, t)
                }
                Some(proto::input_binding::Action::ColorPalette(_)) => 1.0,
                None => 0.0,
            };

            // Clamp value between 0.0 and 1.0
            output.insert(channel.clone(), value.clamp(0.0, 1.0));
        }

        Ok(output)
    })
}
