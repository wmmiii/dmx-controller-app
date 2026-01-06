use crate::proto::{self, scene::tile::OneShotDetails};

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
