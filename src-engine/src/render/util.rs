use crate::{
    proto::{
        effect::Effect, output_target::Output, ColorPalette, FixtureState, OutputTarget, Project,
    },
    render::render_target::RenderTarget,
};

pub fn apply_effect<T: RenderTarget<T>>(
    project: &Project,
    render_target: &mut T,
    output_target: &OutputTarget,
    _beat_number: &u64,
    _beat_t: &f64,
    effect: &Effect,
    color_palette: &ColorPalette,
) {
    match effect {
        Effect::RampEffect(_ramp_effect) => todo!(),
        Effect::RandomEffect(_random_effect) => todo!(),
        Effect::StaticEffect(static_effect) => match &static_effect.state {
            Some(s) => apply_state(project, render_target, output_target, &s, color_palette),
            None => return,
        },
        Effect::StrobeEffect(_strobe_effect) => todo!("Implement strobe"),
        Effect::SequenceEffect(_sequence_effect) => todo!("Implement sequence"),
    }
}

pub fn apply_state<T: RenderTarget<T>>(
    project: &Project,
    render_target: &mut T,
    output_target: &OutputTarget,
    state: &FixtureState,
    color_palette: &ColorPalette,
) {
    let output = match &output_target.output {
        Some(o) => o,
        None => return,
    };

    match output {
        Output::Fixtures(f) => {
            match f
                .fixture_ids
                .iter()
                .find(|id| id.patch == project.active_patch)
            {
                Some(qid) => render_target.apply_state(qid, state, color_palette),
                None => return,
            }
        }
        Output::Group(id) => match project.groups.get(id) {
            Some(g) => {
                for target in &g.targets {
                    apply_state(project, render_target, &target, state, color_palette);
                }
            }
            None => return,
        },
    };
}

pub fn interpolate_palettes(a: ColorPalette, b: ColorPalette, t: f64) -> ColorPalette {
    use crate::proto::{color_palette::ColorDescription, Color, ColorPalette};

    let interpolate_color = |a: &Color, b: &Color, t: f64| -> Color {
        Color {
            red: (1.0 - t) * a.red + t * b.red,
            green: (1.0 - t) * a.green + t * b.green,
            blue: (1.0 - t) * a.blue + t * b.blue,
            white: match (a.white, b.white) {
                (Some(aw), Some(bw)) => Some((1.0 - t) * aw + t * bw),
                (Some(aw), None) => Some((1.0 - t) * aw),
                (None, Some(bw)) => Some(t * bw),
                (None, None) => None,
            },
        }
    };

    let interpolate_desc = |a: Option<&ColorDescription>,
                            b: Option<&ColorDescription>,
                            t: f64|
     -> Option<ColorDescription> {
        match (a, b) {
            (Some(a_desc), Some(b_desc)) => match (&a_desc.color, &b_desc.color) {
                (Some(a_color), Some(b_color)) => Some(ColorDescription {
                    color: Some(interpolate_color(a_color, b_color, t)),
                }),
                _ => None,
            },
            (Some(a_desc), None) => Some(a_desc.clone()),
            (None, Some(b_desc)) => Some(b_desc.clone()),
            (None, None) => None,
        }
    };

    ColorPalette {
        name: b.name.clone(),
        primary: interpolate_desc(a.primary.as_ref(), b.primary.as_ref(), t),
        secondary: interpolate_desc(a.secondary.as_ref(), b.secondary.as_ref(), t),
        tertiary: interpolate_desc(a.tertiary.as_ref(), b.tertiary.as_ref(), t),
    }
}
