//! Project-wide traversal helpers. The Rust counterpart to the frontend's
//! `iterateAllEffects` (`src/util/projectUtils.ts`): backend mutations that must
//! touch every effect or fixture state (delete, re-id, rename-that-others-
//! reference) go through one crawl here so they can't drift from the UI's
//! coverage or each other.

use crate::proto::effect::Effect as EffectKind;
use crate::proto::{Effect, FixtureState, Project};

/// Generates a random u64 ID.
#[must_use]
pub fn rand_id() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    // Combine time with a simple counter for uniqueness
    u64::try_from(duration.as_nanos()).unwrap()
        ^ u64::try_from(duration.as_micros())
            .unwrap()
            .wrapping_mul(31)
}

/// Visits every top-level effect in the project — across all scenes, autopilot
/// playlists, and timecoded shows — with a mutable reference.
pub fn visit_effects(project: &mut Project, mut visitor: impl FnMut(&mut Effect)) {
    for scene in project.scenes.values_mut() {
        for tile_map in &mut scene.tile_map {
            let Some(tile) = tile_map.tile.as_mut() else {
                continue;
            };
            for targeted in &mut tile.targeted_effects {
                if let Some(effect) = targeted.effect.as_mut() {
                    visitor(effect);
                }
            }
        }
    }

    for playlist in project.playlists.values_mut() {
        for pattern in &mut playlist.patterns {
            for targeted in &mut pattern.targeted_effects {
                if let Some(effect) = targeted.effect.as_mut() {
                    visitor(effect);
                }
            }
        }
    }

    for show in project.shows.values_mut() {
        for output in &mut show.outputs {
            let Some(layer) = output.layer.as_mut() else {
                continue;
            };
            for timecoded in &mut layer.effects {
                if let Some(effect) = timecoded.effect.as_mut() {
                    visitor(effect);
                }
            }
        }
    }
}

/// Visits every [`FixtureState`] reachable from the project's effects, recursing
/// into the sub-effects of random effects.
pub fn visit_fixture_states(project: &mut Project, mut visitor: impl FnMut(&mut FixtureState)) {
    visit_effects(project, |effect| {
        visit_effect_states(effect, &mut visitor);
    });
}

fn visit_effect_states(effect: &mut Effect, visitor: &mut impl FnMut(&mut FixtureState)) {
    match effect.effect.as_mut() {
        Some(EffectKind::StaticEffect(e)) => visit_state(e.state.as_mut(), visitor),
        Some(EffectKind::RampEffect(e)) => {
            visit_state(e.state_start.as_mut(), visitor);
            visit_state(e.state_end.as_mut(), visitor);
        }
        Some(EffectKind::StrobeEffect(e)) => {
            visit_state(e.state_a.as_mut(), visitor);
            visit_state(e.state_b.as_mut(), visitor);
        }
        Some(EffectKind::RandomEffect(e)) => {
            if let Some(sub) = e.effect_a.as_deref_mut() {
                visit_effect_states(sub, visitor);
            }
            if let Some(sub) = e.effect_b.as_deref_mut() {
                visit_effect_states(sub, visitor);
            }
        }
        _ => {}
    }
}

fn visit_state(state: Option<&mut FixtureState>, visitor: &mut impl FnMut(&mut FixtureState)) {
    if let Some(state) = state {
        visitor(state);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proto::effect::{RampEffect, RandomEffect, StaticEffect};
    use crate::proto::scene::{Tile, TileMap};
    use crate::proto::{Scene, TargetedEffect};
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

    fn scene_with(effects: Vec<TargetedEffect>) -> Project {
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
        Project {
            scenes,
            ..Default::default()
        }
    }

    #[test]
    fn visits_states_including_nested_random_effects() {
        let mut project = scene_with(vec![
            targeted(EffectKind::StaticEffect(StaticEffect {
                state: Some(state_with(&[1])),
            })),
            targeted(EffectKind::RandomEffect(Box::new(RandomEffect {
                effect_a: Some(Box::new(Effect {
                    effect: Some(EffectKind::RampEffect(RampEffect {
                        state_start: Some(state_with(&[2])),
                        state_end: Some(state_with(&[3])),
                        ..Default::default()
                    })),
                })),
                ..Default::default()
            }))),
        ]);

        let mut seen: Vec<Vec<u64>> = Vec::new();
        visit_fixture_states(&mut project, |state| {
            seen.push(state.visualizer_ids.clone());
        });

        assert_eq!(seen, vec![vec![1], vec![2], vec![3]]);
    }
}
