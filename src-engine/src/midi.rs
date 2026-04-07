use std::borrow::Cow;
use std::collections::HashMap;

use crate::beat::{set_bpm, set_first_beat};
use crate::project;
use crate::proto::{self, InputBinding, InputType, TileStrengthAction};
use crate::tile::{calculate_tile_strength, enable_tile, toggle_tile};

static NOTE_ON: &str = "144,";
static NOTE_OFF: &str = "128,";

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
    original_channel: &str,
    original_value: f64,
    cct: Option<ControlCommandType>,
    t: u64,
) -> Result<ActionResult, String> {
    project::with_project_mut(|project| {
        // For note on and off values we simply map the "NOTE_OFF" channel type to the "NODE_ON" with a value of 0.0.
        let (channel_cow, value): (Cow<str>, f64) = if original_channel.starts_with(NOTE_ON) {
            (Cow::Borrowed(original_channel), 1.0)
        } else if original_channel.starts_with(NOTE_OFF) {
            (Cow::Owned(original_channel.replace(NOTE_OFF, NOTE_ON)), 0.0)
        } else {
            (Cow::Borrowed(original_channel), original_value)
        };
        let channel = channel_cow.as_ref();

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
                let modified = perform_tile_strength(project, tile_action, value, cct, t);
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
    tile_action: &TileStrengthAction,
    value: f64,
    cct: Option<ControlCommandType>,
    t: u64,
) -> bool {
    if let Some(scene) = project.scenes.get_mut(&project.active_scene)
        && let Some(tile_entry) = scene
            .tile_map
            .iter_mut()
            .find(|tm| tm.id == tile_action.tile_id)
        && let Some(tile) = tile_entry.tile.as_mut()
    {
        let beat = match &project.live_beat {
            Some(b) => *b,
            None => return false,
        };
        #[allow(clippy::cast_possible_truncation)]
        if cct.is_some() {
            // Fader input - set absolute strength
            tile.transition = Some(proto::scene::tile::Transition::AbsoluteStrength(
                if tile_action.invert {
                    1.0 - value as f32
                } else {
                    value as f32
                },
            ));
            true
        } else if tile_action.hold {
            // Binary hold input - enable when note down
            enable_tile(tile, &beat, t, value > 0.5);
            true
        } else if value > 0.5 {
            // Binary input - toggle tile
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
                    let strength = calculate_tile_strength(project, tile_action.tile_id, t);
                    if tile_action.invert {
                        1.0 - strength
                    } else {
                        strength
                    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proto::{self, BeatMetadata, Scene};

    fn create_test_project_with_tile() -> proto::Project {
        let mut project = proto::Project::default();
        project.active_scene = 1;

        let mut scene = Scene::default();
        scene.name = "Test Scene".to_string();

        // Add a tile
        let mut tile = proto::scene::Tile::default();
        tile.name = "Test Tile".to_string();

        let mut tile_map_entry = proto::scene::TileMap::default();
        tile_map_entry.id = 100;
        tile_map_entry.tile = Some(tile);
        scene.tile_map.push(tile_map_entry);

        project.scenes.insert(1, scene);

        // Add beat metadata for timing
        project.live_beat = Some(BeatMetadata {
            offset_ms: 0,
            length_ms: 500.0, // 120 BPM
        });

        project
    }

    #[test]
    fn test_tile_strength_invert_normal() {
        let mut project = create_test_project_with_tile();

        let tile_action = TileStrengthAction {
            tile_id: 100,
            invert: false,
            hold: false,
        };

        // Test with value 0.75 (should stay 0.75 without invert)
        let modified = perform_tile_strength(
            &mut project,
            &tile_action,
            0.75,
            Some(ControlCommandType::Msb),
            0,
        );

        assert!(modified, "Action should modify the project");

        let tile = &project.scenes[&1].tile_map[0].tile.as_ref().unwrap();
        if let Some(proto::scene::tile::Transition::AbsoluteStrength(strength)) = &tile.transition {
            assert!(
                (strength - 0.75).abs() < 0.001,
                "Strength should be 0.75 without invert"
            );
        } else {
            panic!("Expected AbsoluteStrength transition");
        }
    }

    #[test]
    fn test_tile_strength_invert_enabled() {
        let mut project = create_test_project_with_tile();

        let tile_action = TileStrengthAction {
            tile_id: 100,
            invert: true,
            hold: false,
        };

        // Test with value 0.75 (should become 0.25 with invert)
        let modified = perform_tile_strength(
            &mut project,
            &tile_action,
            0.75,
            Some(ControlCommandType::Msb),
            0,
        );

        assert!(modified, "Action should modify the project");

        let tile = &project.scenes[&1].tile_map[0].tile.as_ref().unwrap();
        if let Some(proto::scene::tile::Transition::AbsoluteStrength(strength)) = &tile.transition {
            assert!(
                (strength - 0.25).abs() < 0.001,
                "Strength should be inverted: 1.0 - 0.75 = 0.25"
            );
        } else {
            panic!("Expected AbsoluteStrength transition");
        }
    }

    #[test]
    fn test_tile_strength_hold_enabled_press() {
        let mut project = create_test_project_with_tile();

        // Set up loop timing details for the tile so enable_tile works
        if let Some(scene) = project.scenes.get_mut(&1) {
            if let Some(tile_entry) = scene.tile_map.first_mut() {
                if let Some(tile) = tile_entry.tile.as_mut() {
                    tile.timing_details = Some(proto::scene::tile::TimingDetails::Loop(
                        proto::scene::tile::LoopDetails::default(),
                    ));
                }
            }
        }

        let tile_action = TileStrengthAction {
            tile_id: 100,
            invert: false,
            hold: true,
        };

        // Test button press (value = 1.0) with hold enabled - should enable tile
        let modified = perform_tile_strength(&mut project, &tile_action, 1.0, None, 0);

        assert!(modified, "Action should modify the project");

        let tile = &project.scenes[&1].tile_map[0].tile.as_ref().unwrap();
        // Should enable the tile, which sets a fade-in or fade-out transition
        assert!(
            tile.transition.is_some(),
            "Hold press should set a transition"
        );
    }

    #[test]
    fn test_tile_strength_hold_enabled_release() {
        let mut project = create_test_project_with_tile();

        // Set up loop timing details for the tile so enable_tile works
        if let Some(scene) = project.scenes.get_mut(&1) {
            if let Some(tile_entry) = scene.tile_map.first_mut() {
                if let Some(tile) = tile_entry.tile.as_mut() {
                    tile.timing_details = Some(proto::scene::tile::TimingDetails::Loop(
                        proto::scene::tile::LoopDetails::default(),
                    ));
                    // Set initial state to fading in so release can toggle to fade out
                    tile.transition = Some(proto::scene::tile::Transition::StartFadeInMs(0));
                }
            }
        }

        let tile_action = TileStrengthAction {
            tile_id: 100,
            invert: false,
            hold: true,
        };

        // Test button release (value = 0.0) with hold enabled - should disable tile
        let modified = perform_tile_strength(&mut project, &tile_action, 0.0, None, 0);

        assert!(modified, "Action should modify the project");

        let tile = &project.scenes[&1].tile_map[0].tile.as_ref().unwrap();
        // Should disable the tile, which sets a fade-out transition
        assert!(
            matches!(
                tile.transition,
                Some(proto::scene::tile::Transition::StartFadeOutMs(_))
            ),
            "Hold release should set a fade-out transition"
        );
    }

    #[test]
    fn test_tile_strength_button_toggle_without_hold() {
        let mut project = create_test_project_with_tile();

        // Set up loop timing details for the tile so toggle works
        if let Some(scene) = project.scenes.get_mut(&1) {
            if let Some(tile_entry) = scene.tile_map.first_mut() {
                if let Some(tile) = tile_entry.tile.as_mut() {
                    tile.timing_details = Some(proto::scene::tile::TimingDetails::Loop(
                        proto::scene::tile::LoopDetails::default(),
                    ));
                }
            }
        }

        let tile_action = TileStrengthAction {
            tile_id: 100,
            invert: false,
            hold: false,
        };

        // Test button press (value = 1.0) without hold - should toggle
        let modified = perform_tile_strength(&mut project, &tile_action, 1.0, None, 0);

        assert!(modified, "Action should modify the project");

        let tile = &project.scenes[&1].tile_map[0].tile.as_ref().unwrap();
        // Should toggle, which sets transition based on tile state
        assert!(
            tile.transition.is_some(),
            "Tile should have a transition after toggle"
        );
    }

    #[test]
    fn test_tile_strength_button_release_without_hold() {
        let mut project = create_test_project_with_tile();

        let tile_action = TileStrengthAction {
            tile_id: 100,
            invert: false,
            hold: false,
        };

        // Test button release (value = 0.0) without hold - should not modify
        let modified = perform_tile_strength(&mut project, &tile_action, 0.0, None, 0);

        assert!(!modified, "Release without hold should not modify");
    }

    #[test]
    fn test_midi_output_invert() {
        use crate::project;
        use std::collections::HashMap;

        let mut project = create_test_project_with_tile();

        // Set tile strength to 0.75
        if let Some(scene) = project.scenes.get_mut(&1) {
            if let Some(tile_entry) = scene.tile_map.first_mut() {
                if let Some(tile) = tile_entry.tile.as_mut() {
                    tile.transition = Some(proto::scene::tile::Transition::AbsoluteStrength(0.75));
                }
            }
        }

        // Add controller mapping
        let controller_name = "TestController";
        let binding_id = 42u64;
        project.controller_mapping = Some(proto::ControllerMapping {
            controller_to_binding: HashMap::from([(controller_name.to_string(), binding_id)]),
            binding_names: HashMap::new(),
        });

        // Create binding without invert
        let binding_normal = proto::InputBinding {
            input_type: proto::InputType::Continuous.into(),
            action: Some(proto::input_binding::Action::TileStrength(
                TileStrengthAction {
                    tile_id: 100,
                    invert: false,
                    hold: false,
                },
            )),
        };

        // Create binding with invert
        let binding_inverted = proto::InputBinding {
            input_type: proto::InputType::Continuous.into(),
            action: Some(proto::input_binding::Action::TileStrength(
                TileStrengthAction {
                    tile_id: 100,
                    invert: true,
                    hold: false,
                },
            )),
        };

        // Add scene-level bindings
        let mut scene_bindings = proto::ControllerBindingsMap::default();
        let mut controller_bindings = proto::controller_bindings_map::ControllerBindings::default();
        controller_bindings
            .bindings
            .insert("normal".to_string(), binding_normal);
        controller_bindings
            .bindings
            .insert("inverted".to_string(), binding_inverted);
        scene_bindings
            .bindings
            .insert(binding_id, controller_bindings);

        if let Some(scene) = project.scenes.get_mut(&1) {
            scene.controller_bindings = Some(scene_bindings);
        }

        // Load project into global state
        use prost::Message;
        let project_binary = project.encode_to_vec();
        project::load(&project_binary).unwrap();

        // Calculate MIDI output
        let output = calculate_midi_output(controller_name, 0).unwrap();

        // Normal output should be 0.75
        assert!(
            (output.get("normal").unwrap() - 0.75).abs() < 0.001,
            "Normal output should be 0.75, got {}",
            output.get("normal").unwrap()
        );

        // Inverted output should be 0.25 (1.0 - 0.75)
        assert!(
            (output.get("inverted").unwrap() - 0.25).abs() < 0.001,
            "Inverted output should be 0.25, got {}",
            output.get("inverted").unwrap()
        );
    }
}
