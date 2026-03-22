#![allow(clippy::cast_precision_loss)]

use crate::{
    proto::{ColorPalette, OutputTarget, Project, effect::SequenceEffect},
    render::{
        render_target::RenderTarget,
        util::{apply_effect, calculate_timing, get_fixtures},
    },
};

const SEQUENCE_BEAT_RESOLUTION: f64 = 7200.0;

pub fn apply_sequence_effect<T: RenderTarget<T>>(
    project: &Project,
    render_target: &mut T,
    output_target: &OutputTarget,
    system_t: u64,
    effect_t: Option<&f64>,
    beat_t: f64,
    frame: u32,
    sequence_effect: &SequenceEffect,
    color_palette: &ColorPalette,
) {
    if sequence_effect.sequence_id == 0 {
        return;
    }

    let sequence = project
        .sequences
        .get(&sequence_effect.sequence_id)
        .expect("Could not find sequence!");

    let fixtures = get_fixtures(project, output_target);

    for (fixture_index, fixture) in fixtures.iter().enumerate() {
        let t = calculate_timing(
            &sequence_effect.timing_mode.unwrap(),
            system_t,
            effect_t,
            beat_t / f64::from(sequence.native_beats),
            fixture_index as f64 / fixtures.len() as f64,
        );

        #[allow(clippy::cast_lossless)]
        #[allow(clippy::cast_possible_truncation)]
        #[allow(clippy::cast_sign_loss)]
        let sequence_t = (t * SEQUENCE_BEAT_RESOLUTION * f64::from(sequence.native_beats)) as u64;

        for layer in &sequence.layers {
            // This is super expensive to do per fixture per layer. Consider optimizing by creating a BST for each layer per sequence apply.
            let effect_option = layer.effects.iter().find(|e| {
                (e.start_ms < u32::try_from(sequence_t).unwrap())
                    && (e.end_ms >= u32::try_from(sequence_t).unwrap())
            });
            let Some(effect) = effect_option else {
                continue;
            };

            let single_target = &OutputTarget {
                output: Some(crate::proto::output_target::Output::Fixtures(
                    crate::proto::output_target::FixtureMapping {
                        fixture_ids: vec![*fixture],
                    },
                )),
            };

            apply_effect(
                project,
                render_target,
                single_target,
                sequence_t,
                Some(
                    &(f64::from(u32::try_from(sequence_t).unwrap() - effect.start_ms)
                        / f64::from(effect.end_ms - effect.start_ms)),
                ),
                beat_t,
                frame,
                effect.effect.as_ref().unwrap().effect.as_ref().unwrap(),
                color_palette,
            );
        }
    }
}
