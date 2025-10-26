use std::cmp::Ordering;

use crate::{
    proto::{
        output::Output,
        scene::{
            tile::{EffectChannel, FadeInDuration, Transition},
            TileMap,
        },
        Effect, Project, Scene, SerialDmxOutput,
    },
    render::{
        dmx_render_target::DmxRenderTarget,
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
        if self.priority < other.priority {
            return Ordering::Less;
        } else if self.priority > other.priority {
            return Ordering::Greater;
        } else if self.x < other.x {
            return Ordering::Less;
        } else if self.x > other.x {
            return Ordering::Greater;
        } else if self.y < other.y {
            return Ordering::Less;
        } else if self.y > other.y {
            return Ordering::Greater;
        } else {
            return Ordering::Equal;
        }
    }
}

pub fn render_live_dmx(
    project: &Project,
    output_id: u64,
    system_t: u64,
    beat_metadata: &crate::proto::BeatMetadata,
) -> Result<[u8; 512], String> {
    let output: &SerialDmxOutput = match project
        .patches
        .get(&project.active_patch)
        .and_then(|p| p.outputs.get(&output_id))
        .and_then(|o| o.output.as_ref())
    {
        Some(Output::SerialDmxOutput(serial)) => serial,
        Some(_) => return Err("Output specified not DMX!".to_string()),
        None => {
            return Err(format!(
                "Could not find output {} for patch {}",
                output_id, project.active_patch
            ))
        }
    };

    let fixture_definitions = match project
        .fixture_definitions
        .as_ref()
        .map(|d| &d.dmx_fixture_definitions)
    {
        Some(fixture_definitions) => fixture_definitions,
        None => return Err("Fixture definitions not defined!".to_string()),
    };

    let scene = match project.scenes.get(&project.active_scene) {
        Some(scene) => scene,
        None => return Err(format!("Could not find scene {}", project.active_scene)),
    };

    let mut render_target = DmxRenderTarget::new(output, fixture_definitions);

    render_scene(scene, &mut render_target, system_t, beat_metadata, project);

    return Ok(render_target.get_universe());
}

fn render_scene<T: RenderTarget<T>>(
    scene: &Scene,
    render_target: &mut T,
    t: u64,
    beat_metadata: &crate::proto::BeatMetadata,
    project: &Project,
) {
    let beat_number =
        ((t - beat_metadata.offset_ms) as f64 / beat_metadata.length_ms).floor() as u64;
    let beat_t =
        (t as f64 - (beat_number as f64 * beat_metadata.length_ms)) / beat_metadata.length_ms;

    // Interpolate color palette
    let color_palette_t = {
        let since = (t as i64) - (scene.color_palette_start_transition as i64);
        let since = if since < 0 { 0 } else { since as u64 };
        (since as f64 / scene.color_palette_transition_duration_ms as f64).min(1.0)
    };

    let color_palette = interpolate_palettes(
        scene
            .color_palettes
            .get(&scene.last_active_color_palette)
            .cloned()
            .unwrap_or_default(),
        scene
            .color_palettes
            .get(&scene.active_color_palette)
            .cloned()
            .unwrap_or_default(),
        color_palette_t,
    );

    // Sort tiles by priority, then y (descending), then x (descending)
    let mut tile_map = scene.tile_map.clone();
    tile_map.sort();
    tile_map.reverse();

    for tile_map_entry in &tile_map {
        let tile = match &tile_map_entry.tile {
            Some(t) => t,
            None => continue,
        };

        // Skip one-shot tiles that are fading out
        if tile.one_shot && matches!(&tile.transition, Some(Transition::StartFadeOutMs(_))) {
            continue;
        }

        // Calculate time since transition
        let since_transition = match &tile.transition {
            Some(Transition::StartFadeInMs(ts)) | Some(Transition::StartFadeOutMs(ts)) => {
                (t as i64) - (*ts as i64)
            }
            _ => 0,
        };
        let since_transition = if since_transition < 0 {
            0
        } else {
            since_transition as u64
        };

        // Calculate amount (fade in/out)
        let amount: f64 = match &tile.transition {
            Some(Transition::StartFadeInMs(_)) => {
                let fade_in_ms = match &tile.fade_in_duration {
                    Some(FadeInDuration::FadeInBeat(beats)) => {
                        (*beats as f64) * (beat_metadata.length_ms as f64)
                    }
                    Some(FadeInDuration::FadeInMs(ms)) => *ms as f64,
                    None => 0.0,
                };

                (since_transition as f64 / fade_in_ms).min(1.0)
            }
            Some(crate::proto::scene::tile::Transition::StartFadeOutMs(_)) => {
                let fade_out_ms = match &tile.fade_out_duration {
                    Some(crate::proto::scene::tile::FadeOutDuration::FadeOutBeat(beats)) => {
                        (*beats as f64) * (beat_metadata.length_ms as f64)
                    }
                    Some(crate::proto::scene::tile::FadeOutDuration::FadeOutMs(ms)) => *ms as f64,
                    None => 0.0,
                };

                if since_transition as f64 > fade_out_ms {
                    continue; // Tile has fully faded out
                }

                (1.0 - (since_transition as f64 / fade_out_ms)).max(0.0)
            }
            Some(crate::proto::scene::tile::Transition::AbsoluteStrength(strength)) => {
                *strength as f64
            }
            None => 0.0,
        };

        let before = render_target.clone();
        let mut after = render_target.clone();

        // Process tile based on description type
        for channel in &tile.channels {
            match &channel {
                EffectChannel {
                    effect:
                        Some(Effect {
                            effect: Some(effect),
                            ..
                        }),
                    output_target: Some(output_target),
                } => apply_effect(
                    project,
                    &mut after,
                    &output_target,
                    &beat_number,
                    &beat_t,
                    effect,
                    &color_palette,
                ),
                _ => return,
            }
        }

        // Interpolate between before and after based on amount
        render_target.interpolate(&before, &after, amount);
    }
}
