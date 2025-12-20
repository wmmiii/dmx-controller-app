use crate::proto;

pub fn calculate_tile_strength(project: &proto::Project, tile_id: u64, t: u64) -> f64 {
    // Find the active scene
    let scene = project.scenes.get(&project.active_scene).unwrap();

    // Find the tile in the tile map
    let tile_entry = scene.tile_map.iter().find(|tm| tm.id == tile_id);

    let Some(tile_entry) = tile_entry else {
        return 0.0;
    };

    let tile = tile_entry.tile.as_ref().unwrap();

    tile_active_amount(tile, project.live_beat.as_ref(), t)
}

pub fn tile_active_amount(
    tile: &proto::scene::Tile,
    beat: Option<&proto::BeatMetadata>,
    t: u64,
) -> f64 {
    match &tile.transition {
        Some(proto::scene::tile::Transition::StartFadeInMs(start_t)) => {
            if tile.one_shot {
                let duration = get_tile_duration_ms(tile, beat);
                if t < start_t + duration {
                    1.0
                } else {
                    0.0
                }
            } else {
                1.0
            }
        }
        Some(proto::scene::tile::Transition::AbsoluteStrength(strength)) => *strength as f64,
        _ => 0.0,
    }
}

fn get_tile_duration_ms(tile: &proto::scene::Tile, beat: Option<&proto::BeatMetadata>) -> u64 {
    match &tile.duration {
        Some(proto::scene::tile::Duration::DurationBeat(_)) => {
            if let Some(b) = beat {
                b.length_ms as u64
            } else {
                0
            }
        }
        Some(proto::scene::tile::Duration::DurationMs(ms)) => *ms as u64,
        None => 0,
    }
}
