use crate::{
    proto::{effect::RampEffect, ColorPalette, OutputTarget, Project},
    render::{
        render_target::RenderTarget,
        util::{apply_state, calculate_timing, get_fixtures},
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
    let fixtures = get_fixtures(project, output_target);

    for (i, fixture) in fixtures.iter().enumerate() {
        let t = calculate_timing(
            &ramp_effect.timing_mode.unwrap(),
            ms_since_start,
            effect_duration_ms,
            beat_t,
            i as f64 / fixtures.len() as f64,
        );

        let mut start = render_target.clone();
        let mut end = render_target.clone();

        let single_target = &OutputTarget {
            output: Some(crate::proto::output_target::Output::Fixtures(
                crate::proto::output_target::FixtureMapping {
                    fixture_ids: vec![*fixture],
                },
            )),
        };

        apply_state(
            project,
            &mut start,
            single_target,
            &ramp_effect.state_start.clone().unwrap(),
            color_palette,
        );

        apply_state(
            project,
            &mut end,
            single_target,
            &ramp_effect.state_end.clone().unwrap(),
            color_palette,
        );

        render_target.interpolate(&start, &end, t);
    }
}
