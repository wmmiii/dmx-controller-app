use crate::proto::{
    self,
    scene::tile::{OneShotDetails, TimingDetails, Transition},
};

pub fn calculate_tile_strength(project: &proto::Project, tile_id: u64, t: u64) -> f64 {
    // Find the active scene
    let scene = project.scenes.get(&project.active_scene).unwrap();

    // Find the tile in the tile map
    let tile_entry = scene.tile_map.iter().find(|tm| tm.id == tile_id);

    let Some(tile_entry) = tile_entry else {
        return 0.0;
    };

    let tile = tile_entry.tile.as_ref().unwrap();

    tile_active_amount(tile, &project.live_beat.unwrap(), t)
}

pub fn tile_active_amount(tile: &proto::scene::Tile, beat: &proto::BeatMetadata, t: u64) -> f64 {
    match &tile.transition {
        Some(proto::scene::tile::Transition::AbsoluteStrength(strength)) => *strength as f64,
        Some(proto::scene::tile::Transition::StartFadeInMs(start_fade_time)) => {
            match tile.timing_details {
                Some(proto::scene::tile::TimingDetails::OneShot(OneShotDetails {
                    duration: Some(duration),
                })) => {
                    if t < start_fade_time + duration.as_ms(beat) as u64 {
                        1.0
                    } else {
                        0.0
                    }
                }
                _ => 1.0,
            }
        }
        Some(proto::scene::tile::Transition::StartFadeOutMs(_)) | None => 0.0,
    }
}

/// Toggles a tile on or off based on its current state.
/// For one-shot tiles, always restarts.
/// For loop tiles, toggles between fade-in and fade-out with contiguous transitions.
pub fn toggle_tile(tile: &mut proto::scene::Tile, beat: &proto::BeatMetadata, t: u64) {
    // One-shot tiles should always restart now
    if let Some(TimingDetails::OneShot(_)) = &tile.timing_details {
        tile.transition = Some(Transition::StartFadeInMs(t));
        return;
    }

    // Get loop details for fade calculations
    let loop_details = match &tile.timing_details {
        Some(TimingDetails::Loop(details)) => details.clone(),
        _ => return, // No timing details, can't toggle
    };

    let fade_in_ms = loop_details
        .fade_in
        .as_ref()
        .map(|d| d.as_ms(beat))
        .unwrap_or(0.0);
    let fade_out_ms = loop_details
        .fade_out
        .as_ref()
        .map(|d| d.as_ms(beat))
        .unwrap_or(0.0);

    // Determine if we should enable or disable
    let set_enabled = match &tile.transition {
        Some(Transition::StartFadeOutMs(_)) => true,
        Some(Transition::AbsoluteStrength(strength)) => *strength < 0.5,
        _ => false,
    };

    match &tile.transition {
        None | Some(Transition::AbsoluteStrength(_)) => {
            // Start fade out from current position
            tile.transition = Some(Transition::StartFadeOutMs(0));
        }
        Some(Transition::StartFadeInMs(start_time)) if !set_enabled => {
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
        Some(Transition::StartFadeOutMs(start_time)) if set_enabled => {
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
        _ => {}
    }
}
