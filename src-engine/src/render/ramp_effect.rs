use crate::{
    proto::{effect::RampEffect, ColorPalette, OutputTarget, Project},
    render::{
        render_target::RenderTarget,
        util::{apply_state, calculate_timing},
    },
};

pub fn apply_ramp_effect<T: RenderTarget<T>>(
    project: &Project,
    render_target: &mut T,
    output_target: &OutputTarget,
    ms_since_start: &u64,
    effect_duration_ms: &u64,
    beat_t: &f64,
    ramp_effect: &RampEffect,
    color_palette: &ColorPalette,
) {
    let t = calculate_timing(
        &ramp_effect.timing_mode.unwrap(),
        ms_since_start,
        effect_duration_ms,
        beat_t,
    );

    let mut start = render_target.clone();
    let mut end = render_target.clone();

    apply_state(
        project,
        &mut start,
        output_target,
        &ramp_effect.state_start.clone().unwrap(),
        color_palette,
    );

    apply_state(
        project,
        &mut end,
        output_target,
        &ramp_effect.state_end.clone().unwrap(),
        color_palette,
    );

    render_target.interpolate(&start, &end, t);
}
