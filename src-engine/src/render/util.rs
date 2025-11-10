use crate::{
    proto::{
        effect::Effect,
        effect_timing::{Absolute, Beat, EasingFunction, Timing},
        output,
        output_target::Output,
        ColorPalette, EffectTiming, FixtureState, OutputTarget, Project, QualifiedFixtureId,
        SacnDmxOutput, SerialDmxOutput, WledOutput,
    },
    render::{
        project::get_all_output_targets, ramp_effect::apply_ramp_effect,
        random_effect::apply_random_effect, render_target::RenderTarget,
        strobe_effect::apply_strobe_effect,
    },
};
use std::f64::consts::PI;

pub fn apply_effect<T: RenderTarget<T>>(
    project: &Project,
    render_target: &mut T,
    output_target: &OutputTarget,
    system_t: &u64,
    // Number of milliseconds since the start of the effect.
    ms_since_start: &u64,
    effect_duration_ms: &u64,
    beat_t: &f64,
    frame: &u32,
    seed: &u64,
    effect: &Effect,
    color_palette: &ColorPalette,
) {
    match effect {
        Effect::RampEffect(ramp_effect) => apply_ramp_effect(
            project,
            render_target,
            output_target,
            ms_since_start,
            effect_duration_ms,
            beat_t,
            ramp_effect,
            color_palette,
        ),
        Effect::RandomEffect(random_effect) => apply_random_effect(
            project,
            render_target,
            output_target,
            system_t,
            frame,
            seed,
            ms_since_start,
            effect_duration_ms,
            beat_t,
            random_effect,
            color_palette,
        ),
        Effect::StaticEffect(static_effect) => apply_state(
            project,
            render_target,
            output_target,
            static_effect.state.as_ref().unwrap(),
            color_palette,
        ),
        Effect::StrobeEffect(strobe_effect) => apply_strobe_effect(
            project,
            render_target,
            output_target,
            frame,
            strobe_effect,
            color_palette,
        ),
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
        Output::Group(0) => {
            for target in get_all_output_targets(project) {
                apply_state(project, render_target, &target, state, color_palette);
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

pub fn get_fixtures(project: &Project, output_target: &OutputTarget) -> Vec<QualifiedFixtureId> {
    let output = match &output_target.output {
        Some(o) => o,
        None => return vec![],
    };

    match output {
        Output::Fixtures(f) => {
            match f
                .fixture_ids
                .iter()
                .find(|id| id.patch == project.active_patch)
            {
                Some(qid) => vec![*qid],
                None => vec![],
            }
        }

        Output::Group(0) => project
            .patches
            .get(&project.active_patch)
            .unwrap()
            .outputs
            .iter()
            .flat_map(|(output_id, o)| {
                o.output
                    .as_ref()
                    .map(|out| match out {
                        output::Output::SacnDmxOutput(SacnDmxOutput { fixtures, .. })
                        | output::Output::SerialDmxOutput(SerialDmxOutput { fixtures, .. }) => {
                            fixtures
                                .iter()
                                .map(|(fixture_id, _)| QualifiedFixtureId {
                                    patch: project.active_patch,
                                    output: *output_id,
                                    fixture: *fixture_id,
                                })
                                .collect::<Vec<_>>()
                        }
                        output::Output::WledOutput(WledOutput { segments, .. }) => segments
                            .iter()
                            .map(|(segment_id, _)| QualifiedFixtureId {
                                patch: project.active_patch,
                                output: *output_id,
                                fixture: *segment_id as u64,
                            })
                            .collect::<Vec<_>>(),
                    })
                    .into_iter()
                    .flatten()
            })
            .collect(),

        Output::Group(id) => {
            let mut ids: Vec<QualifiedFixtureId> = Vec::new();

            let mut groups = vec![id];
            while let Some(gid) = groups.pop() {
                for target in project.groups[gid].targets.iter() {
                    match &target.output {
                        Some(Output::Group(id)) => groups.push(&id),
                        Some(Output::Fixtures(fixtures)) => {
                            fixtures
                                .fixture_ids
                                .iter()
                                .filter(|id| id.patch == project.active_patch)
                                .for_each(|id| ids.push(*id));
                        }
                        _ => (),
                    }
                }
            }

            ids
        }
    }
}

pub fn calculate_timing(
    effect_timing: &EffectTiming,
    ms_since_start: &u64,
    event_duration_ms: &u64,
    beat_t: &f64,
    phase_index: f64,
) -> f64 {
    // Calculate based on timing mode.
    let mut t = match effect_timing.timing {
        Some(Timing::Absolute(Absolute { duration })) => *ms_since_start as f64 / duration as f64,
        Some(Timing::Beat(Beat { multiplier })) => beat_t / multiplier as f64,
        Some(Timing::OneShot(_)) => *ms_since_start as f64 / *event_duration_ms as f64,
        _ => panic!("Timing type not specified when trying to calculate timing!"),
    };

    // Modify with phase offset.
    t = (t + effect_timing.phase * phase_index).fract();

    // Mirror if necessary.
    if effect_timing.mirrored && t < 0.5 {
        t *= 2.0;
    } else if effect_timing.mirrored {
        t = (1.0 - t) * 2.0;
    }

    // Ease.
    let eased_t = match EasingFunction::try_from(effect_timing.easing) {
        Ok(EasingFunction::Linear) => t,
        Ok(EasingFunction::EaseIn) => t * t * t,
        Ok(EasingFunction::EaseOut) => 1.0 - (1.0 - t).powf(3.0),
        Ok(EasingFunction::EaseInOut) => t * t * (3.0 - 2.0 * t),
        Ok(EasingFunction::Sine) => (-(PI * t).cos() - 1.0) / 2.0,
        _ => panic!("Unknown easing type!"),
    };

    return eased_t;
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
