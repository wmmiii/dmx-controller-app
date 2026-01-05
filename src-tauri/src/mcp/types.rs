// Type conversions between Protobuf and JSON for MCP communication

use dmx_engine::proto::{
    color::{Color, ColorPalette, PaletteColor},
    effect::{Effect, FixtureState},
    output::OutputTarget,
    scene::{Scene, Scene_Tile, Scene_TileMap},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Convert a Scene to a JSON representation for the AI
pub fn scene_to_json(scene: &Scene) -> Value {
    json!({
        "name": scene.name,
        "tiles": scene.tile_map.iter().map(tile_map_to_json).collect::<Vec<_>>(),
        "color_palettes": color_palettes_to_json(&scene.color_palettes),
        "active_color_palette": scene.active_color_palette.to_string(),
    })
}

/// Convert a TileMap to JSON
pub fn tile_map_to_json(tile_map: &Scene_TileMap) -> Value {
    let tile = tile_map.tile.as_ref();

    json!({
        "id": tile_map.id.to_string(),
        "name": tile.as_ref().map(|t| &t.name).unwrap_or(&String::new()),
        "position": {
            "x": tile_map.x,
            "y": tile_map.y
        },
        "priority": tile_map.priority,
        "tile": tile.as_ref().map(tile_to_json),
    })
}

/// Convert a Tile to JSON
pub fn tile_to_json(tile: &Scene_Tile) -> Value {
    let mut result = json!({
        "name": tile.name,
        "one_shot": tile.one_shot,
        "channels": tile.channels.iter().map(effect_channel_to_json).collect::<Vec<_>>(),
    });

    let obj = result.as_object_mut().unwrap();

    // Handle duration oneof
    match &tile.duration {
        Some(dmx_engine::proto::scene::scene::tile::Duration::DurationMs(ms)) => {
            obj.insert("duration_ms".to_string(), json!(ms));
        }
        Some(dmx_engine::proto::scene::scene::tile::Duration::DurationBeat(beat)) => {
            obj.insert("duration_beats".to_string(), json!(beat));
        }
        None => {}
    }

    // Handle fade_in_duration oneof
    match &tile.fade_in_duration {
        Some(dmx_engine::proto::scene::scene::tile::FadeInDuration::FadeInMs(ms)) => {
            obj.insert("fade_in_ms".to_string(), json!(ms));
        }
        Some(dmx_engine::proto::scene::scene::tile::FadeInDuration::FadeInBeat(beat)) => {
            obj.insert("fade_in_beats".to_string(), json!(beat));
        }
        None => {}
    }

    // Handle fade_out_duration oneof
    match &tile.fade_out_duration {
        Some(dmx_engine::proto::scene::scene::tile::FadeOutDuration::FadeOutMs(ms)) => {
            obj.insert("fade_out_ms".to_string(), json!(ms));
        }
        Some(dmx_engine::proto::scene::scene::tile::FadeOutDuration::FadeOutBeat(beat)) => {
            obj.insert("fade_out_beats".to_string(), json!(beat));
        }
        None => {}
    }

    // Handle transition state
    match &tile.transition {
        Some(dmx_engine::proto::scene::scene::tile::Transition::StartFadeInMs(t)) => {
            obj.insert("transition".to_string(), json!({"fade_in_start": t.to_string()}));
        }
        Some(dmx_engine::proto::scene::scene::tile::Transition::StartFadeOutMs(t)) => {
            obj.insert("transition".to_string(), json!({"fade_out_start": t.to_string()}));
        }
        Some(dmx_engine::proto::scene::scene::tile::Transition::AbsoluteStrength(s)) => {
            obj.insert("transition".to_string(), json!({"strength": s}));
        }
        None => {}
    }

    result
}

/// Convert an EffectChannel to JSON
fn effect_channel_to_json(channel: &dmx_engine::proto::scene::scene::tile::EffectChannel) -> Value {
    json!({
        "effect": channel.effect.as_ref().map(effect_to_json),
        "output_target": channel.output_target.as_ref().map(output_target_to_json),
    })
}

/// Convert an Effect to JSON
fn effect_to_json(effect: &Effect) -> Value {
    match &effect.effect {
        Some(dmx_engine::proto::effect::effect::Effect::StaticEffect(e)) => {
            json!({
                "type": "static",
                "state": fixture_state_to_json(&e.state),
            })
        }
        Some(dmx_engine::proto::effect::effect::Effect::RampEffect(e)) => {
            json!({
                "type": "ramp",
                "state_start": e.state_start.as_ref().map(fixture_state_to_json),
                "state_end": e.state_end.as_ref().map(fixture_state_to_json),
                "timing": e.timing_mode.as_ref().map(effect_timing_to_json),
            })
        }
        Some(dmx_engine::proto::effect::effect::Effect::StrobeEffect(e)) => {
            json!({
                "type": "strobe",
                "state_a": e.state_a.as_ref().map(fixture_state_to_json),
                "state_b": e.state_b.as_ref().map(fixture_state_to_json),
                "state_a_frames": e.state_a_fames,
                "state_b_frames": e.state_b_fames,
            })
        }
        Some(dmx_engine::proto::effect::effect::Effect::RandomEffect(e)) => {
            json!({
                "type": "random",
                "effect_a": e.effect_a.as_ref().map(effect_to_json),
                "effect_b": e.effect_b.as_ref().map(effect_to_json),
                "seed": e.seed,
                "effect_a_min": e.effect_a_min,
                "effect_a_variation": e.effect_a_variation,
                "effect_b_min": e.effect_b_min,
                "effect_b_variation": e.effect_b_variation,
                "treat_fixtures_individually": e.treat_fixtures_individually,
            })
        }
        Some(dmx_engine::proto::effect::effect::Effect::SequenceEffect(e)) => {
            json!({
                "type": "sequence",
                "sequence_id": e.sequence_id.to_string(),
                "timing": e.timing_mode.as_ref().map(effect_timing_to_json),
            })
        }
        None => json!(null),
    }
}

/// Convert EffectTiming to JSON
fn effect_timing_to_json(timing: &dmx_engine::proto::effect::EffectTiming) -> Value {
    let mut result = json!({
        "easing": easing_to_string(&timing.easing()),
        "mirrored": timing.mirrored,
        "phase": timing.phase,
    });

    let obj = result.as_object_mut().unwrap();

    match &timing.timing {
        Some(dmx_engine::proto::effect::effect_timing::Timing::Absolute(abs)) => {
            obj.insert("duration_ms".to_string(), json!(abs.duration));
        }
        Some(dmx_engine::proto::effect::effect_timing::Timing::Beat(beat)) => {
            obj.insert("beat_multiplier".to_string(), json!(beat.multiplier));
        }
        Some(dmx_engine::proto::effect::effect_timing::Timing::OneShot(_)) => {
            obj.insert("one_shot".to_string(), json!(true));
        }
        None => {}
    }

    result
}

/// Convert EasingFunction enum to string
fn easing_to_string(easing: &dmx_engine::proto::effect::effect_timing::EasingFunction) -> &str {
    use dmx_engine::proto::effect::effect_timing::EasingFunction;
    match easing {
        EasingFunction::Linear => "linear",
        EasingFunction::EaseIn => "ease_in",
        EasingFunction::EaseOut => "ease_out",
        EasingFunction::EaseInOut => "ease_in_out",
        EasingFunction::Sine => "sine",
    }
}

/// Convert FixtureState to JSON
fn fixture_state_to_json(state: &FixtureState) -> Value {
    let mut result = json!({
        "channels": state.channels.iter().map(|c| json!({
            "index": c.index,
            "value": c.value,
        })).collect::<Vec<_>>(),
    });

    let obj = result.as_object_mut().unwrap();

    // Handle light_color oneof
    match &state.light_color {
        Some(dmx_engine::proto::effect::fixture_state::LightColor::Color(c)) => {
            obj.insert("color".to_string(), color_to_json(c));
        }
        Some(dmx_engine::proto::effect::fixture_state::LightColor::PaletteColor(pc)) => {
            obj.insert("palette_color".to_string(), palette_color_to_json(pc));
        }
        None => {}
    }

    // Optional fields
    if let Some(dimmer) = state.dimmer {
        obj.insert("dimmer".to_string(), json!(dimmer));
    }
    if let Some(pan) = state.pan {
        obj.insert("pan".to_string(), json!(pan));
    }
    if let Some(tilt) = state.tilt {
        obj.insert("tilt".to_string(), json!(tilt));
    }
    if let Some(width) = state.width {
        obj.insert("width".to_string(), json!(width));
    }
    if let Some(height) = state.height {
        obj.insert("height".to_string(), json!(height));
    }
    if let Some(zoom) = state.zoom {
        obj.insert("zoom".to_string(), json!(zoom));
    }
    if let Some(speed) = state.speed {
        obj.insert("speed".to_string(), json!(speed));
    }
    if let Some(strobe) = state.strobe {
        obj.insert("strobe".to_string(), json!(strobe));
    }
    if let Some(wled_effect) = state.wled_effect {
        obj.insert("wled_effect".to_string(), json!(wled_effect));
    }
    if let Some(wled_palette) = state.wled_palette {
        obj.insert("wled_palette".to_string(), json!(wled_palette));
    }

    result
}

/// Convert Color to JSON
fn color_to_json(color: &Color) -> Value {
    json!({
        "r": color.r,
        "g": color.g,
        "b": color.b,
        "w": color.w,
    })
}

/// Convert PaletteColor to JSON
fn palette_color_to_json(pc: &PaletteColor) -> Value {
    json!({
        "index": pc.index,
    })
}

/// Convert OutputTarget to JSON
fn output_target_to_json(target: &OutputTarget) -> Value {
    match &target.target {
        Some(dmx_engine::proto::output::output_target::Target::FixtureId(id)) => {
            json!({
                "type": "fixture",
                "id": id.to_string(),
            })
        }
        Some(dmx_engine::proto::output::output_target::Target::GroupId(id)) => {
            json!({
                "type": "group",
                "id": id.to_string(),
            })
        }
        Some(dmx_engine::proto::output::output_target::Target::PatchId(id)) => {
            json!({
                "type": "patch",
                "id": id.to_string(),
            })
        }
        None => json!(null),
    }
}

/// Convert color palettes map to JSON
fn color_palettes_to_json(palettes: &std::collections::HashMap<u64, ColorPalette>) -> Value {
    let palettes_obj: serde_json::Map<String, Value> = palettes
        .iter()
        .map(|(id, palette)| {
            (
                id.to_string(),
                json!({
                    "name": palette.name,
                    "colors": palette.colors.iter().map(color_to_json).collect::<Vec<_>>(),
                }),
            )
        })
        .collect();

    Value::Object(palettes_obj)
}

// TODO: Implement JSON → Protobuf conversions for create_tile and modify_tile operations
// These will be needed when the AI wants to create or modify tiles
