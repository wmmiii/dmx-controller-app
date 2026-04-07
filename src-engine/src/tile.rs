#![allow(clippy::cast_possible_truncation)]
#![allow(clippy::cast_precision_loss)]
#![allow(clippy::cast_sign_loss)]

use crate::proto::{
    self,
    scene::tile::{LoopDetails, OneShotDetails, TimingDetails, Transition},
};

#[must_use]
pub fn calculate_tile_strength(project: &proto::Project, tile_id: u64, t: u64) -> f64 {
    // Find the active scene
    let scene = project.scenes.get(&project.active_scene).unwrap();

    // Find the tile in the tile map
    let tile_entry = scene.tile_map.iter().find(|tm| tm.id == tile_id);

    let Some(tile_entry) = tile_entry else {
        return 0.0;
    };

    let tile = tile_entry.tile.as_ref().unwrap();

    let beat = &project.live_beat.unwrap();

    match &tile.transition {
        Some(proto::scene::tile::Transition::AbsoluteStrength(strength)) => f64::from(*strength),
        Some(proto::scene::tile::Transition::StartFadeInMs(fade_in_ms)) => {
            match tile.timing_details {
                Some(proto::scene::tile::TimingDetails::OneShot(OneShotDetails {
                    duration: Some(duration),
                })) => ((t - fade_in_ms) as f64 / duration.as_ms(beat)).clamp(0.0, 1.0),
                Some(proto::scene::tile::TimingDetails::Loop(LoopDetails {
                    fade_in: Some(fade_in),
                    fade_out: _,
                })) => ((t - fade_in_ms) as f64 / fade_in.as_ms(beat)).clamp(0.0, 1.0),
                _ => 0.0,
            }
        }
        Some(proto::scene::tile::Transition::StartFadeOutMs(fade_out_ms)) => {
            match tile.timing_details {
                Some(proto::scene::tile::TimingDetails::Loop(LoopDetails {
                    fade_in: _,
                    fade_out: Some(fade_out),
                })) => 1.0 - ((t - fade_out_ms) as f64 / fade_out.as_ms(beat)).clamp(0.0, 1.0),
                _ => 0.0,
            }
        }
        None => 0.0,
    }
}

/// Toggles a tile on or off based on its current state.
pub fn toggle_tile(tile: &mut proto::scene::Tile, beat: &proto::BeatMetadata, t: u64) {
    // Determine if we should enable or disable
    let enabled = match &tile.transition {
        Some(Transition::StartFadeOutMs(_)) => true,
        Some(Transition::AbsoluteStrength(strength)) => *strength < 0.5,
        _ => false,
    };

    enable_tile(tile, beat, t, enabled);
}

/// Sets the tile's enabled state
/// For one-shot tiles, always restarts.
/// For loop tiles, toggles between fade-in and fade-out with contiguous transitions.
pub fn enable_tile(
    tile: &mut proto::scene::Tile,
    beat: &proto::BeatMetadata,
    t: u64,
    enabled: bool,
) {
    // One-shot tiles should always restart now
    if let Some(TimingDetails::OneShot(_)) = &tile.timing_details {
        tile.transition = Some(Transition::StartFadeInMs(t));
        return;
    }

    // Get loop details for fade calculations
    let loop_details = match &tile.timing_details {
        Some(TimingDetails::Loop(details)) => *details,
        _ => return, // No timing details, can't toggle
    };

    let fade_in_ms = loop_details.fade_in.as_ref().map_or(0.0, |d| d.as_ms(beat));
    let fade_out_ms = loop_details
        .fade_out
        .as_ref()
        .map_or(0.0, |d| d.as_ms(beat));

    match &tile.transition {
        Some(Transition::AbsoluteStrength(amount)) => {
            if enabled {
                // Set fade in such that effect is contiguous
                let fade_in_start = t - (f64::from(*amount) * fade_in_ms) as u64;
                tile.transition = Some(Transition::StartFadeInMs(fade_in_start));
            } else {
                // Set fade out such that effect is contiguous
                let fade_out_start = t - ((1.0 - f64::from(*amount)) * fade_out_ms) as u64;
                tile.transition = Some(Transition::StartFadeOutMs(fade_out_start));
            }
        }
        Some(Transition::StartFadeInMs(start_time)) if !enabled => {
            // Currently fading in, switch to fade out with contiguous transition

            let since = (t - start_time) as f64;
            let amount = if since == 0.0 {
                0.0
            } else {
                (since / fade_in_ms).min(1.0)
            };

            // Set fade out such that effect is contiguous
            let fade_out_start = t - ((1.0 - amount) * fade_out_ms) as u64;
            tile.transition = Some(Transition::StartFadeOutMs(fade_out_start));
        }
        Some(Transition::StartFadeOutMs(start_time)) if enabled => {
            // Currently fading out, switch to fade in with contiguous transition

            let since = (t - start_time) as f64;
            let amount = if since == 0.0 {
                0.0
            } else {
                (1.0 - since / fade_out_ms).max(0.0)
            };

            // Set fade in such that effect is contiguous
            let fade_in_start = t - (amount * fade_in_ms) as u64;
            tile.transition = Some(Transition::StartFadeInMs(fade_in_start));
        }
        None => {
            if enabled {
                tile.transition = Some(Transition::StartFadeInMs(0));
            } else {
                tile.transition = Some(Transition::StartFadeOutMs(0));
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proto::{
        self, BeatMetadata, Duration, Scene, duration,
        scene::{
            Tile, TileMap,
            tile::{LoopDetails, OneShotDetails, TimingDetails, Transition},
        },
    };
    use std::collections::HashMap;

    fn create_test_beat() -> BeatMetadata {
        BeatMetadata {
            length_ms: 500.0, // 120 BPM = 500ms per beat
            offset_ms: 0,
        }
    }

    fn create_test_project(scene: Scene) -> proto::Project {
        let scene_id = 1u64;
        let mut scenes = HashMap::new();
        scenes.insert(scene_id, scene);

        proto::Project {
            active_scene: scene_id,
            scenes,
            live_beat: Some(create_test_beat()),
            ..Default::default()
        }
    }

    fn create_duration_beats(beats: f64) -> Duration {
        Duration {
            amount: Some(duration::Amount::Beat(beats)),
        }
    }

    fn create_tile_with_transition(transition: Transition, timing: TimingDetails) -> Tile {
        Tile {
            transition: Some(transition),
            timing_details: Some(timing),
            ..Default::default()
        }
    }

    #[test]
    fn test_calculate_tile_strength_absolute() {
        let tile = create_tile_with_transition(
            Transition::AbsoluteStrength(0.75),
            TimingDetails::Loop(LoopDetails::default()),
        );

        let scene = Scene {
            tile_map: vec![TileMap {
                id: 1,
                tile: Some(tile),
                ..Default::default()
            }],
            ..Default::default()
        };

        let project = create_test_project(scene);
        let strength = calculate_tile_strength(&project, 1, 1000);

        assert_eq!(strength, 0.75);
    }

    #[test]
    fn test_calculate_tile_strength_one_shot_fade_in() {
        let tile = create_tile_with_transition(
            Transition::StartFadeInMs(0),
            TimingDetails::OneShot(OneShotDetails {
                duration: Some(create_duration_beats(4.0)),
            }),
        );

        let scene = Scene {
            tile_map: vec![TileMap {
                id: 1,
                tile: Some(tile),
                ..Default::default()
            }],
            ..Default::default()
        };

        let project = create_test_project(scene);

        // Duration of 4 beats at 120 BPM = 2000ms
        let duration_ms = 2000;

        // At 0ms, strength should be 0
        let strength = calculate_tile_strength(&project, 1, 0);
        assert_eq!(strength, 0.0);

        // At 1000ms (50% through), strength should be 0.5
        let strength = calculate_tile_strength(&project, 1, 1000);
        assert_eq!(strength, 0.5);

        // At 2000ms (100% through), strength should be 1.0
        let strength = calculate_tile_strength(&project, 1, duration_ms);
        assert_eq!(strength, 1.0);
    }

    #[test]
    fn test_calculate_tile_strength_loop_fade_in() {
        let tile = create_tile_with_transition(
            Transition::StartFadeInMs(0),
            TimingDetails::Loop(LoopDetails {
                fade_in: Some(create_duration_beats(2.0)),
                fade_out: Some(create_duration_beats(2.0)),
            }),
        );

        let scene = Scene {
            tile_map: vec![TileMap {
                id: 1,
                tile: Some(tile),
                ..Default::default()
            }],
            ..Default::default()
        };

        let project = create_test_project(scene);

        // Fade in of 2 beats at 120 BPM = 1000ms
        let fade_in_ms = 1000;

        // At 0ms, strength should be 0
        let strength = calculate_tile_strength(&project, 1, 0);
        assert_eq!(strength, 0.0);

        // At 500ms (50% through), strength should be 0.5
        let strength = calculate_tile_strength(&project, 1, 500);
        assert_eq!(strength, 0.5);

        // At 1000ms (100% through), strength should be 1.0
        let strength = calculate_tile_strength(&project, 1, fade_in_ms);
        assert_eq!(strength, 1.0);

        // Beyond fade in, should clamp to 1.0
        let strength = calculate_tile_strength(&project, 1, 2000);
        assert_eq!(strength, 1.0);
    }

    #[test]
    fn test_calculate_tile_strength_loop_fade_out() {
        let tile = create_tile_with_transition(
            Transition::StartFadeOutMs(0),
            TimingDetails::Loop(LoopDetails {
                fade_in: Some(create_duration_beats(2.0)),
                fade_out: Some(create_duration_beats(2.0)),
            }),
        );

        let scene = Scene {
            tile_map: vec![TileMap {
                id: 1,
                tile: Some(tile),
                ..Default::default()
            }],
            ..Default::default()
        };

        let project = create_test_project(scene);

        // Fade out of 2 beats at 120 BPM = 1000ms
        let fade_out_ms = 1000;

        // At 0ms, strength should be 1.0
        let strength = calculate_tile_strength(&project, 1, 0);
        assert_eq!(strength, 1.0);

        // At 500ms (50% through), strength should be 0.5
        let strength = calculate_tile_strength(&project, 1, 500);
        assert_eq!(strength, 0.5);

        // At 1000ms (100% through), strength should be 0.0
        let strength = calculate_tile_strength(&project, 1, fade_out_ms);
        assert_eq!(strength, 0.0);

        // Beyond fade out, should clamp to 0.0
        let strength = calculate_tile_strength(&project, 1, 2000);
        assert_eq!(strength, 0.0);
    }

    #[test]
    fn test_calculate_tile_strength_missing_tile() {
        let scene = Scene::default();
        let project = create_test_project(scene);

        // Non-existent tile should return 0.0
        let strength = calculate_tile_strength(&project, 999, 1000);
        assert_eq!(strength, 0.0);
    }

    #[test]
    fn test_toggle_tile_one_shot_always_restarts() {
        let beat = create_test_beat();
        let mut tile = create_tile_with_transition(
            Transition::AbsoluteStrength(1.0),
            TimingDetails::OneShot(OneShotDetails {
                duration: Some(create_duration_beats(4.0)),
            }),
        );

        toggle_tile(&mut tile, &beat, 1000);

        // One-shot should always restart at current time
        assert_eq!(tile.transition, Some(Transition::StartFadeInMs(1000)));
    }

    #[test]
    fn test_toggle_tile_loop_fade_in_to_fade_out() {
        let beat = create_test_beat();
        let mut tile = create_tile_with_transition(
            Transition::StartFadeInMs(0),
            TimingDetails::Loop(LoopDetails {
                fade_in: Some(create_duration_beats(2.0)),
                fade_out: Some(create_duration_beats(2.0)),
            }),
        );

        // At 500ms, we're 50% through the fade in (1000ms total)
        toggle_tile(&mut tile, &beat, 500);

        // Should switch to fade out, positioned so it continues smoothly
        // We're at 50% strength, so fade out should be 50% complete
        // Fade out is 1000ms, so we should be 500ms into it
        assert_eq!(tile.transition, Some(Transition::StartFadeOutMs(0)));
    }

    #[test]
    fn test_toggle_tile_loop_fade_out_to_fade_in() {
        let beat = create_test_beat();
        let mut tile = create_tile_with_transition(
            Transition::StartFadeOutMs(0),
            TimingDetails::Loop(LoopDetails {
                fade_in: Some(create_duration_beats(2.0)),
                fade_out: Some(create_duration_beats(2.0)),
            }),
        );

        // At 500ms, we're 50% through the fade out (1000ms total)
        toggle_tile(&mut tile, &beat, 500);

        // Should switch to fade in, positioned so it continues smoothly
        // We're at 50% strength (fading from 1.0 to 0.5), so fade in should start at 50%
        // Fade in is 1000ms, so we should be 500ms into it
        assert_eq!(tile.transition, Some(Transition::StartFadeInMs(0)));
    }

    #[test]
    fn test_toggle_tile_absolute_low_to_fade_in() {
        let beat = create_test_beat();
        let mut tile = create_tile_with_transition(
            Transition::AbsoluteStrength(0.25),
            TimingDetails::Loop(LoopDetails {
                fade_in: Some(create_duration_beats(2.0)),
                fade_out: Some(create_duration_beats(2.0)),
            }),
        );

        toggle_tile(&mut tile, &beat, 1000);

        // Absolute strength < 0.5 should toggle to fade in
        // At 25% strength, fade in should be 25% complete
        // Fade in is 1000ms, so we should be 250ms into it
        assert_eq!(tile.transition, Some(Transition::StartFadeInMs(750)));
    }

    #[test]
    fn test_toggle_tile_absolute_high_to_fade_out() {
        let beat = create_test_beat();
        let mut tile = create_tile_with_transition(
            Transition::AbsoluteStrength(0.75),
            TimingDetails::Loop(LoopDetails {
                fade_in: Some(create_duration_beats(2.0)),
                fade_out: Some(create_duration_beats(2.0)),
            }),
        );

        toggle_tile(&mut tile, &beat, 1000);

        // Absolute strength >= 0.5 should toggle to fade out
        // At 75% strength, fade out should be 25% complete (from 1.0 to 0.75)
        // Fade out is 1000ms, so we should be 250ms into it
        assert_eq!(tile.transition, Some(Transition::StartFadeOutMs(750)));
    }

    #[test]
    fn test_enable_tile_one_shot_always_restarts() {
        let beat = create_test_beat();
        let mut tile = create_tile_with_transition(
            Transition::AbsoluteStrength(1.0),
            TimingDetails::OneShot(OneShotDetails {
                duration: Some(create_duration_beats(4.0)),
            }),
        );

        // Enabling or disabling one-shot should always restart
        enable_tile(&mut tile, &beat, 2000, false);
        assert_eq!(tile.transition, Some(Transition::StartFadeInMs(2000)));

        enable_tile(&mut tile, &beat, 3000, true);
        assert_eq!(tile.transition, Some(Transition::StartFadeInMs(3000)));
    }

    #[test]
    fn test_enable_tile_loop_from_none() {
        let beat = create_test_beat();
        let mut tile = Tile {
            transition: None,
            timing_details: Some(TimingDetails::Loop(LoopDetails {
                fade_in: Some(create_duration_beats(2.0)),
                fade_out: Some(create_duration_beats(2.0)),
            })),
            ..Default::default()
        };

        // Enabling from None should start fade in at t=0
        enable_tile(&mut tile, &beat, 1000, true);
        assert_eq!(tile.transition, Some(Transition::StartFadeInMs(0)));

        tile.transition = None;

        // Disabling from None should start fade out at t=0
        enable_tile(&mut tile, &beat, 1000, false);
        assert_eq!(tile.transition, Some(Transition::StartFadeOutMs(0)));
    }

    #[test]
    fn test_enable_tile_contiguous_transitions() {
        let beat = create_test_beat();
        let mut tile = create_tile_with_transition(
            Transition::StartFadeInMs(0),
            TimingDetails::Loop(LoopDetails {
                fade_in: Some(create_duration_beats(2.0)),
                fade_out: Some(create_duration_beats(2.0)),
            }),
        );

        // At 500ms into a 1000ms fade in, we're at 50% strength
        // Switching to fade out should position the fade out start
        // so that we continue smoothly at 50% strength
        enable_tile(&mut tile, &beat, 500, false);

        // Fade out should be 50% complete (500ms into 1000ms)
        // So start time should be 500 - 500 = 0
        assert_eq!(tile.transition, Some(Transition::StartFadeOutMs(0)));

        // Now switch back at 750ms
        // We're 750ms into the fade out, which is 75% complete
        // So we're at 25% strength
        enable_tile(&mut tile, &beat, 750, true);

        // Fade in should be 25% complete (250ms into 1000ms)
        // So start time should be 750 - 250 = 500
        assert_eq!(tile.transition, Some(Transition::StartFadeInMs(500)));
    }
}
