use crate::{
    proto::{effect::StrobeEffect, ColorPalette, OutputTarget, Project},
    render::{render_target::RenderTarget, util::apply_state},
};

pub fn apply_strobe_effect<T: RenderTarget<T>>(
    project: &Project,
    render_target: &mut T,
    output_target: &OutputTarget,
    frame: &u32,
    strobe_effect: &StrobeEffect,
    color_palette: &ColorPalette,
) {
    if frame % (strobe_effect.state_a_fames + strobe_effect.state_b_fames)
        < strobe_effect.state_a_fames
    {
        apply_state(
            project,
            render_target,
            output_target,
            strobe_effect.state_a.as_ref().unwrap(),
            color_palette,
        );
    } else {
        apply_state(
            project,
            render_target,
            output_target,
            strobe_effect.state_b.as_ref().unwrap(),
            color_palette,
        );
    }
}
