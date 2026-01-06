use std::cmp::Ordering;

use crate::{
    project::PROJECT_REF,
    proto::{
        output::Output,
        scene::{
            tile::{EffectChannel, LoopDetails, OneShotDetails, TimingDetails, Transition},
            TileMap,
        },
        wled_render_target::{Color, Segment},
        BeatMetadata, Duration, Effect, Project, Scene, WledRenderTarget,
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
        if self.priority > other.priority {
            return Ordering::Less;
        } else if self.priority < other.priority {
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

impl Duration {
    pub fn as_ms(&self, beat_metadata: &BeatMetadata) -> f64 {
        match self.amount {
            Some(crate::proto::duration::Amount::Ms(ms)) => ms as f64,
            Some(crate::proto::duration::Amount::Beat(b)) => (b * beat_metadata.length_ms) as f64,
            None => panic!("Unknown duration type!"),
        }
    }
}

pub fn render_scene_dmx(output_id: u64, system_t: u64, frame: u32) -> Result<[u8; 512], String> {
    let project = PROJECT_REF
        .lock()
        .map_err(|e| format!("Failed to lock project: {}", e))?;

    let fixtures = match project
        .patches
        .get(&project.active_patch)
        .and_then(|p| p.outputs.get(&output_id))
        .and_then(|o| o.output.as_ref())
    {
        Some(Output::SerialDmxOutput(serial)) => &serial.fixtures,
        Some(Output::SacnDmxOutput(sacn)) => &sacn.fixtures,
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

    let mut render_target = DmxRenderTarget::new(&fixtures, fixture_definitions);

    let Some(beat_metadata) = project.live_beat else {
        return Err("Live beat not set!".to_string());
    };

    render_scene(
        scene,
        &mut render_target,
        system_t,
        frame,
        &beat_metadata,
        &project,
    );

    Ok(render_target.get_universe())
}

pub fn render_scene_wled(
    output_id: u64,
    system_t: u64,
    frame: u32,
) -> Result<WledRenderTarget, String> {
    let project = PROJECT_REF
        .lock()
        .map_err(|e| format!("Failed to lock project: {}", e))?;

    let wled_output = match project
        .patches
        .get(&project.active_patch)
        .and_then(|p| p.outputs.get(&output_id))
        .and_then(|o| o.output.as_ref())
    {
        Some(Output::WledOutput(output)) => output,
        Some(_) => return Err("Output specified not WLED!".to_string()),
        None => {
            return Err(format!(
                "Could not find output {} for patch {}",
                output_id, project.active_patch
            ))
        }
    };

    let mut render_target = WledRenderTarget {
        id: output_id,
        segments: wled_output
            .segments
            .iter()
            .map(|_| Segment {
                effect: 0,
                palette: 0,
                primary_color: Some(Color {
                    red: 0.0,
                    green: 0.0,
                    blue: 0.0,
                }),
                speed: 1.0,
                brightness: 1.0,
            })
            .collect(),
    };

    let scene = match project.scenes.get(&project.active_scene) {
        Some(scene) => scene,
        None => return Err(format!("Could not find scene {}", project.active_scene)),
    };

    let Some(beat_metadata) = project.live_beat else {
        return Err("Live beat not set!".to_string());
    };

    render_scene(
        scene,
        &mut render_target,
        system_t,
        frame,
        &beat_metadata,
        &project,
    );

    return Ok(render_target);
}

fn render_scene<T: RenderTarget<T>>(
    scene: &Scene,
    render_target: &mut T,
    system_t: u64,
    frame: u32,
    beat_metadata: &BeatMetadata,
    project: &Project,
) {
    let beat_t = (system_t - beat_metadata.offset_ms) as f64 / beat_metadata.length_ms;

    // Interpolate color palette
    let color_palette_t = {
        let since = (system_t as i64) - (scene.color_palette_start_transition as i64);
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

        // Calculate amount (fade in/out)
        let amount: f64 = match &tile.transition {
            Some(Transition::AbsoluteStrength(a)) => *a as f64,
            Some(Transition::StartFadeInMs(fade_in_time)) => match &tile.timing_details {
                Some(TimingDetails::OneShot(OneShotDetails {
                    duration: Some(duration),
                })) => {
                    if system_t - fade_in_time > duration.as_ms(beat_metadata) as u64 {
                        0.0
                    } else {
                        1.0
                    }
                }
                Some(TimingDetails::Loop(LoopDetails {
                    fade_in: Some(fade_in_duration),
                    fade_out: _,
                })) => ((system_t - *fade_in_time) as f64 / fade_in_duration.as_ms(beat_metadata))
                    .clamp(0.0, 1.0),
                _ => 0.0,
            },
            Some(Transition::StartFadeOutMs(fade_out_time)) => match &tile.timing_details {
                Some(TimingDetails::Loop(LoopDetails {
                    fade_in: _,
                    fade_out: Some(fade_out_duration),
                })) => (1.0
                    - ((system_t - *fade_out_time) as f64
                        / fade_out_duration.as_ms(beat_metadata)))
                .clamp(0.0, 1.0),
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
                ((system_t - fade_in_time) as f64 / duration.as_ms(beat_metadata)).clamp(0.0, 1.0),
            ),
            _ => None,
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
                    &system_t,
                    &effect_t,
                    &beat_t,
                    &frame,
                    effect,
                    &color_palette,
                ),
                _ => continue,
            }
        }

        // Interpolate between before and after based on amount
        render_target.interpolate(&before, &after, amount);
    }
}
