#![allow(clippy::cast_precision_loss)]

use crate::{
    proto::{
        ColorPalette, FixtureState, OutputTarget, Project,
        effect::{PresetEffect, preset_effect},
    },
    render::{
        render_target::RenderTarget,
        util::{apply_state, calculate_timing, get_fixtures},
    },
};

pub fn apply_preset_effect<T: RenderTarget<T>>(
    project: &Project,
    render_target: &mut T,
    output_target: &OutputTarget,
    system_t: u64,
    effect_t: Option<&f64>,
    beat_t: f64,
    preset_effect: &PresetEffect,
    color_palette: &ColorPalette,
) {
    let Some(effect) = &preset_effect.effect else {
        return;
    };

    match effect {
        preset_effect::Effect::RainbowEffect(rainbow_effect) => {
            apply_rainbow_effect(
                project,
                render_target,
                output_target,
                system_t,
                effect_t,
                beat_t,
                rainbow_effect,
                color_palette,
            );
        }
        preset_effect::Effect::CircleEffect(circle_effect) => {
            apply_circle_effect(
                project,
                render_target,
                output_target,
                system_t,
                effect_t,
                beat_t,
                circle_effect,
                color_palette,
            );
        }
    }
}

fn apply_rainbow_effect<T: RenderTarget<T>>(
    project: &Project,
    render_target: &mut T,
    output_target: &OutputTarget,
    system_t: u64,
    effect_t: Option<&f64>,
    beat_t: f64,
    rainbow_effect: &preset_effect::RainbowEffect,
    color_palette: &ColorPalette,
) {
    let fixtures = get_fixtures(project, output_target);

    for (i, fixture) in fixtures.iter().enumerate() {
        #[allow(clippy::cast_precision_loss)]
        let t = calculate_timing(
            &rainbow_effect.timing_mode.unwrap(),
            system_t,
            effect_t,
            beat_t,
            i as f64 / fixtures.len() as f64,
        );

        // Convert HSV to RGB for rainbow effect
        // Hue varies from 0.0 to 1.0 (full color wheel)
        let color = hue_to_rgb(t);

        let state = FixtureState {
            light_color: Some(crate::proto::fixture_state::LightColor::Color(color)),
            ..Default::default()
        };

        let single_target = &OutputTarget {
            output: Some(crate::proto::output_target::Output::Fixtures(
                crate::proto::output_target::FixtureMapping {
                    fixture_ids: vec![*fixture],
                },
            )),
        };

        apply_state(project, render_target, single_target, &state, color_palette);
    }
}

fn apply_circle_effect<T: RenderTarget<T>>(
    project: &Project,
    render_target: &mut T,
    output_target: &OutputTarget,
    system_t: u64,
    effect_t: Option<&f64>,
    beat_t: f64,
    circle_effect: &preset_effect::CircleEffect,
    color_palette: &ColorPalette,
) {
    let fixtures = get_fixtures(project, output_target);

    for (i, fixture) in fixtures.iter().enumerate() {
        #[allow(clippy::cast_precision_loss)]
        let t = calculate_timing(
            &circle_effect.timing_mode.unwrap(),
            system_t,
            effect_t,
            beat_t,
            i as f64 / fixtures.len() as f64,
        );

        let angle = t * 2.0 * std::f64::consts::PI;
        let pan_amount = f64::midpoint(angle.cos(), 1.0);
        let tilt_amount = f64::midpoint(angle.sin(), 1.0);

        let state = FixtureState {
            pan: Some(
                pan_amount * f64::from(circle_effect.max_pan - circle_effect.min_pan)
                    + f64::from(circle_effect.min_pan),
            ),
            tilt: Some(
                tilt_amount * f64::from(circle_effect.max_tilt - circle_effect.min_tilt)
                    + f64::from(circle_effect.min_tilt),
            ),
            ..Default::default()
        };

        let single_target = &OutputTarget {
            output: Some(crate::proto::output_target::Output::Fixtures(
                crate::proto::output_target::FixtureMapping {
                    fixture_ids: vec![*fixture],
                },
            )),
        };

        apply_state(project, render_target, single_target, &state, color_palette);
    }
}

/// Convert hue to RGB (with saturation=1.0, value=1.0)
/// h: hue (0.0 - 1.0) representing position on color wheel
#[allow(clippy::many_single_char_names)]
fn hue_to_rgb(h: f64) -> crate::proto::Color {
    let h = h * 6.0; // Scale hue to 0-6 range
    let i = h.floor();
    let f = h - i; // Fractional part - how far into the segment

    #[allow(clippy::cast_possible_truncation)]
    let (r, g, b) = match i as i32 % 6 {
        0 => (1.0, f, 0.0),       // Red to Yellow
        1 => (1.0 - f, 1.0, 0.0), // Yellow to Green
        2 => (0.0, 1.0, f),       // Green to Cyan
        3 => (0.0, 1.0 - f, 1.0), // Cyan to Blue
        4 => (f, 0.0, 1.0),       // Blue to Magenta
        5 => (1.0, 0.0, 1.0 - f), // Magenta to Red
        _ => (0.0, 0.0, 0.0),
    };

    let fract = 1.0 / (r + g + b);

    crate::proto::Color {
        red: r * fract,
        green: g * fract,
        blue: b * fract,
        white: None,
    }
}

/// Convert hue to RGB using Oklch color space for perceptually uniform rainbow
/// This provides consistent perceived brightness and smooth color transitions
/// h: hue (0.0 - 1.0) representing position on color wheel
#[allow(dead_code)]
#[allow(clippy::many_single_char_names)]
fn hue_to_rgb_oklch(h: f64) -> crate::proto::Color {
    use std::f64::consts::PI;

    // Use Oklch (cylindrical Oklab) for perceptual uniformity
    // L (lightness): 0.72 for vibrant colors
    // C (chroma): 0.28 for highly saturated colors (some gamut clipping may occur)
    // h (hue): 0-360 degrees
    let l = 0.72;
    let c = 0.28;
    let h_degrees = h * 360.0;

    // Convert Oklch to Oklab
    let h_rad = h_degrees * PI / 180.0;
    let a = c * h_rad.cos();
    let b = c * h_rad.sin();

    // Convert Oklab to Linear RGB
    let l_ = l + 0.396_337_777_4 * a + 0.215_803_757_3 * b;
    let m_ = l - 0.105_561_345_8 * a - 0.063_854_172_8 * b;
    let s_ = l - 0.089_484_177_5 * a - 1.291_485_548_0 * b;

    // Cube to get LMS
    let l_lms = l_ * l_ * l_;
    let m_lms = m_ * m_ * m_;
    let s_lms = s_ * s_ * s_;

    // Convert LMS to Linear RGB
    let r_linear = 4.076_741_662_1 * l_lms - 3.307_711_591_3 * m_lms + 0.230_969_929_2 * s_lms;
    let g_linear = -1.268_438_004_6 * l_lms + 2.609_757_401_1 * m_lms - 0.341_319_396_5 * s_lms;
    let b_linear = -0.004_196_086_3 * l_lms - 0.703_418_614_7 * m_lms + 1.707_614_701_0 * s_lms;

    // Apply sRGB gamma correction and clamp to [0, 1]
    let r = linear_to_srgb(r_linear).clamp(0.0, 1.0);
    let g = linear_to_srgb(g_linear).clamp(0.0, 1.0);
    let b = linear_to_srgb(b_linear).clamp(0.0, 1.0);

    crate::proto::Color {
        red: r,
        green: g,
        blue: b,
        white: None,
    }
}

/// Apply sRGB gamma correction to linear RGB value
fn linear_to_srgb(linear: f64) -> f64 {
    if linear <= 0.003_130_8 {
        linear * 12.92
    } else {
        1.055 * linear.powf(1.0 / 2.4) - 0.055
    }
}
