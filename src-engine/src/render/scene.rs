use std::cmp::Ordering;

use crate::{
    beat::effective_beat_metadata,
    project::DEFAULT_COLOR_PALETTE,
    proto::{
        BeatMetadata, Duration, Effect, Project,
        scene::{
            TileMap,
            tile::{EffectChannel, LoopDetails, OneShotDetails, TimingDetails, Transition},
        },
    },
    render::{
        render_target::RenderTarget,
        util::{apply_effect, interpolate_palettes},
    },
};

impl Eq for TileMap {}

impl PartialOrd for TileMap {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for TileMap {
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .priority
            .cmp(&self.priority)
            .then_with(|| self.x.cmp(&other.x))
            .then_with(|| self.y.cmp(&other.y))
    }
}

impl Duration {
    #[must_use]
    pub fn as_ms(&self, beat_metadata: &BeatMetadata) -> f64 {
        match self.amount {
            Some(crate::proto::duration::Amount::Ms(ms)) => f64::from(ms),
            Some(crate::proto::duration::Amount::Beat(b)) => b * beat_metadata.length_ms,
            None => panic!("Unknown duration type!"),
        }
    }
}

pub fn render_scene<T: RenderTarget<T>>(
    scene_id: u64,
    render_target: &mut T,
    system_t: u64,
    frame: u32,
    project: &Project,
) -> Result<(), String> {
    let Some(scene) = project.scenes.get(&scene_id) else {
        return Err(format!("Could not find scene {scene_id}"));
    };

    let Some(beat_metadata) = effective_beat_metadata(project, system_t) else {
        return Err("Live beat not set!".to_string());
    };

    #[allow(clippy::cast_precision_loss)]
    let beat_t = (system_t - beat_metadata.offset_ms) as f64 / beat_metadata.length_ms;

    // Interpolate color palette
    let color_palette_t = {
        #[allow(clippy::cast_sign_loss)]
        #[allow(clippy::cast_possible_wrap)]
        let since = (system_t as i64) - (scene.color_palette_start_transition as i64);
        #[allow(clippy::cast_sign_loss)]
        let since = if since < 0 { 0 } else { since as u64 };
        #[allow(clippy::cast_precision_loss)]
        (since as f64 / f64::from(scene.color_palette_transition_duration_ms)).min(1.0)
    };

    let color_palette = interpolate_palettes(
        &scene
            .color_palettes
            .iter()
            .find(|p| p.id == scene.last_active_color_palette)
            .cloned()
            .unwrap_or(DEFAULT_COLOR_PALETTE.clone()),
        &scene
            .color_palettes
            .iter()
            .find(|p| p.id == scene.active_color_palette)
            .cloned()
            .unwrap_or(DEFAULT_COLOR_PALETTE.clone()),
        color_palette_t,
    );

    // Sort tiles by priority, then y (descending), then x (descending)
    let mut tile_map = scene.tile_map.clone();
    tile_map.sort();
    tile_map.reverse();

    for tile_map_entry in &tile_map {
        let Some(tile) = &tile_map_entry.tile else {
            continue;
        };

        // Calculate amount (fade in/out)
        let amount: f64 = match &tile.transition {
            Some(Transition::AbsoluteStrength(a)) => f64::from(*a),
            Some(Transition::StartFadeInMs(fade_in_time)) => match &tile.timing_details {
                Some(TimingDetails::OneShot(OneShotDetails {
                    duration: Some(duration),
                })) =>
                {
                    #[allow(clippy::cast_sign_loss)]
                    #[allow(clippy::cast_possible_truncation)]
                    if system_t - fade_in_time > duration.as_ms(&beat_metadata) as u64 {
                        0.0
                    } else {
                        1.0
                    }
                }
                Some(TimingDetails::Loop(LoopDetails {
                    fade_in: Some(fade_in_duration),
                    fade_out: _,
                })) =>
                {
                    #[allow(clippy::cast_precision_loss)]
                    ((system_t - *fade_in_time) as f64 / fade_in_duration.as_ms(&beat_metadata))
                        .clamp(0.0, 1.0)
                }
                _ => 0.0,
            },
            Some(Transition::StartFadeOutMs(fade_out_time)) => match &tile.timing_details {
                Some(TimingDetails::Loop(LoopDetails {
                    fade_in: _,
                    fade_out: Some(fade_out_duration),
                })) =>
                {
                    #[allow(clippy::cast_precision_loss)]
                    (1.0 - ((system_t - *fade_out_time) as f64
                        / fade_out_duration.as_ms(&beat_metadata)))
                    .clamp(0.0, 1.0)
                }
                _ => 0.0,
            },
            _ => panic!("Unknown transition type!"),
        };

        if amount == 0.0 {
            continue;
        }

        // Calculate effect timing
        let effect_t: Option<f64> = match (tile.timing_details, tile.transition) {
            (
                Some(TimingDetails::OneShot(OneShotDetails {
                    duration: Some(duration),
                })),
                Some(Transition::StartFadeInMs(fade_in_time)),
            ) => Some(
                #[allow(clippy::cast_precision_loss)]
                ((system_t - fade_in_time) as f64 / duration.as_ms(&beat_metadata)).clamp(0.0, 1.0),
            ),
            _ => None,
        };

        let before = render_target.clone();
        let mut after = render_target.clone();

        // Process tile based on description type
        for channel in &tile.channels {
            if let EffectChannel {
                effect:
                    Some(Effect {
                        effect: Some(effect),
                        ..
                    }),
                output_target: Some(output_target),
            } = channel
            {
                apply_effect(
                    project,
                    &mut after,
                    output_target,
                    system_t,
                    effect_t.as_ref(),
                    beat_t,
                    frame,
                    effect,
                    &color_palette,
                );
            }
        }

        // Interpolate between before and after based on amount
        render_target.interpolate(&before, &after, amount);
    }

    Ok(())
}
