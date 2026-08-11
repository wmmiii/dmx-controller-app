//! Visualizer helpers that must stay consistent with the rest of the project.
//! Shared by the desktop app (Tauri MCP + frontend via WASM) so both sides seed
//! new visualizers from the same template and, on delete, strip the id from
//! every effect that references it.

use crate::project_util::visit_fixture_states;
use crate::proto::{Project, Visualizer};

/// Starter GLSL for a freshly created visualizer. Documents the available
/// engine uniforms so both the editor and agents discover them.
pub const DEFAULT_VISUALIZER_GLSL: &str = include_str!("shaders/default.glsl");

/// Builds a new user [`Visualizer`] seeded with the default template.
#[must_use]
pub fn new_visualizer(name: &str) -> Visualizer {
    Visualizer {
        name: name.to_string(),
        glsl_source: DEFAULT_VISUALIZER_GLSL.to_string(),
    }
}

/// Removes a user visualizer and strips its id from every [`FixtureState`] that
/// references it across all scenes, autopilot playlists, and timecoded shows,
/// keeping the project's cross-references consistent. Returns whether a
/// visualizer with that id existed.
pub fn delete_visualizer(project: &mut Project, id: u64) -> bool {
    let existed = project.visualizers.remove(&id).is_some();

    visit_fixture_states(project, |state| {
        state.visualizer_ids.retain(|&v| v != id);
    });

    existed
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proto::effect::{Effect as EffectKind, RampEffect, StaticEffect};
    use crate::proto::scene::{Tile, TileMap};
    use crate::proto::{Effect, FixtureState, Scene, TargetedEffect};
    use std::collections::HashMap;

    fn state_with(ids: &[u64]) -> FixtureState {
        FixtureState {
            visualizer_ids: ids.to_vec(),
            ..Default::default()
        }
    }

    fn targeted(effect: EffectKind) -> TargetedEffect {
        TargetedEffect {
            effect: Some(Effect {
                effect: Some(effect),
            }),
            ..Default::default()
        }
    }

    fn project_with_scene_effects(effects: Vec<TargetedEffect>) -> Project {
        let mut scenes = HashMap::new();
        scenes.insert(
            1,
            Scene {
                tile_map: vec![TileMap {
                    id: 1,
                    tile: Some(Tile {
                        targeted_effects: effects,
                        ..Default::default()
                    }),
                    ..Default::default()
                }],
                ..Default::default()
            },
        );

        let mut visualizers = HashMap::new();
        visualizers.insert(2, new_visualizer("Doomed"));

        Project {
            scenes,
            visualizers,
            ..Default::default()
        }
    }

    #[test]
    fn strips_id_from_all_effect_states_and_removes_visualizer() {
        let mut project = project_with_scene_effects(vec![
            targeted(EffectKind::StaticEffect(StaticEffect {
                state: Some(state_with(&[1, 2])),
            })),
            targeted(EffectKind::RampEffect(RampEffect {
                state_start: Some(state_with(&[2, 3])),
                state_end: Some(state_with(&[2])),
                ..Default::default()
            })),
        ]);

        assert!(delete_visualizer(&mut project, 2));

        assert!(!project.visualizers.contains_key(&2));
        let tile = project.scenes[&1].tile_map[0].tile.as_ref().unwrap();
        let static_state = match tile.targeted_effects[0].effect.as_ref().unwrap().effect {
            Some(EffectKind::StaticEffect(ref e)) => e.state.as_ref().unwrap(),
            _ => panic!("expected static effect"),
        };
        assert_eq!(static_state.visualizer_ids, vec![1]);

        let ramp = match tile.targeted_effects[1].effect.as_ref().unwrap().effect {
            Some(EffectKind::RampEffect(ref e)) => e,
            _ => panic!("expected ramp effect"),
        };
        assert_eq!(ramp.state_start.as_ref().unwrap().visualizer_ids, vec![3]);
        assert!(ramp.state_end.as_ref().unwrap().visualizer_ids.is_empty());
    }

    #[test]
    fn returns_false_for_unknown_visualizer() {
        let mut project = project_with_scene_effects(vec![]);
        assert!(!delete_visualizer(&mut project, 999));
    }
}
