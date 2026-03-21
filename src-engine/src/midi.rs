use std::collections::HashMap;

use crate::proto;
use crate::tile::calculate_tile_strength;

pub fn calculate_midi_output(
    project: &proto::Project,
    controller_name: &str,
    t: u64,
) -> HashMap<String, f64> {
    let mut output = HashMap::new();

    if controller_name.is_empty() {
        return output;
    }

    // Look up binding ID from controller name
    let controller_mapping = match &project.controller_mapping {
        Some(mapping) => mapping,
        None => return output,
    };

    let binding_id = match controller_mapping.controller_to_binding.get(controller_name) {
        Some(id) => id,
        None => return output,
    };

    let beat_metadata = match &project.live_beat {
        Some(beat) => beat,
        None => return output,
    };

    let beat_t = (t - beat_metadata.offset_ms) as f64 / beat_metadata.length_ms as f64;

    // Collect bindings from both global and scene contexts
    let mut all_bindings = HashMap::new();

    // First, add global bindings
    if let Some(controller_bindings_map) = &project.live_page_controller_bindings {
        if let Some(global_bindings) = controller_bindings_map.bindings.get(binding_id) {
            for (channel, binding) in &global_bindings.bindings {
                all_bindings.insert(channel.clone(), binding.clone());
            }
        }
    }

    // Then, add/override with scene-specific bindings
    if let Some(scene) = project.scenes.get(&project.active_scene) {
        if let Some(controller_bindings_map) = &scene.controller_bindings {
            if let Some(scene_bindings) = controller_bindings_map.bindings.get(binding_id) {
                for (channel, binding) in &scene_bindings.bindings {
                    all_bindings.insert(channel.clone(), binding.clone());
                }
            }
        }
    }

    // Calculate output values for all bindings
    for (channel, binding) in &all_bindings {
        let value = match &binding.action {
            Some(proto::input_binding::Action::BeatMatch(_)) => {
                1.0 - (beat_t % 1.0).round()
            }
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
        output.insert(channel.clone(), value.max(0.0).min(1.0));
    }

    output
}
