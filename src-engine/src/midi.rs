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

    let controller = project
        .controller_mapping
        .as_ref()
        .unwrap()
        .controllers
        .get(controller_name)
        .unwrap();

    let beat_metadata = &project.live_beat.unwrap();

    let beat_t = (t - beat_metadata.offset_ms) as f64 / beat_metadata.length_ms as f64;

    for (channel, action) in &controller.actions {
        let value = match &action.action {
            Some(proto::controller_mapping::action::Action::BeatMatch(_)) => {
                1.0 - (beat_t % 1.0).round()
            }
            Some(proto::controller_mapping::action::Action::FirstBeat(_)) => {
                1.0 - ((beat_t % 4.0) / 4.0).round()
            }
            Some(proto::controller_mapping::action::Action::SetTempo(_)) => {
                (60_000.0 / beat_metadata.length_ms - 80.0) / 127.0
            }
            Some(proto::controller_mapping::action::Action::SceneMapping(scene_mapping)) => {
                let scene_id = project.active_scene;
                if let Some(scene_action) = scene_mapping.actions.get(&scene_id) {
                    match &scene_action.action {
                        Some(proto::controller_mapping::scene_action::Action::ColorPaletteId(
                            _,
                        )) => 1.0,
                        Some(proto::controller_mapping::scene_action::Action::TileStrengthId(
                            tile_id,
                        )) => calculate_tile_strength(project, *tile_id, t),
                        None => 0.0,
                    }
                } else {
                    0.0
                }
            }
            None => 0.0,
        };

        // Clamp value between 0.0 and 1.0
        output.insert(channel.clone(), value.max(0.0).min(1.0));
    }

    output
}
