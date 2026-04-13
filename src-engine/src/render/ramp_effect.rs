use crate::{
    proto::{ColorPalette, OutputTarget, Project, effect::RampEffect},
    render::{
        render_target::RenderTarget,
        util::{apply_state, calculate_timing, get_fixtures},
    },
};

pub fn apply_ramp_effect<T: RenderTarget<T>>(
    project: &Project,
    render_target: &mut T,
    output_target: &OutputTarget,
    system_t: u64,
    effect_t: Option<&f64>,
    beat_t: f64,
    ramp_effect: &RampEffect,
    color_palette: &ColorPalette,
) {
    let fixtures = get_fixtures(project, output_target);

    for info in fixtures.values() {
        let t = calculate_timing(
            &ramp_effect.timing_mode.unwrap(),
            system_t,
            effect_t,
            beat_t,
            info.phase,
            info.index,
        );

        let mut start = render_target.clone();
        let mut end = render_target.clone();

        apply_state(
            project,
            &mut start,
            &info.output_target,
            ramp_effect.state_start.as_ref().unwrap(),
            color_palette,
        );

        apply_state(
            project,
            &mut end,
            &info.output_target,
            ramp_effect.state_end.as_ref().unwrap(),
            color_palette,
        );

        render_target.interpolate(&start, &end, t);
    }
}
