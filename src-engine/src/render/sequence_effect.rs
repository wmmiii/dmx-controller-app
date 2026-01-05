use crate::{
    proto::{effect::SequenceEffect, ColorPalette, OutputTarget, Project},
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
    system_t: &u64,
    ms_since_start: &u64,
    effect_duration_ms: &u64,
    beat_t: &f64,
    frame: &u32,
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
            ms_since_start,
            effect_duration_ms,
            &(beat_t / sequence.native_beats as f64),
            fixture_index as f64 / fixtures.len() as f64,
        );

        let sequence_t = (t * SEQUENCE_BEAT_RESOLUTION * (sequence.native_beats as f64)) as u64;

        for layer in &sequence.layers {
            // This is super expensive to do per fixture per layer. Consider optimizing by creating a BST for each layer per sequence apply.
            let effect_option = layer
                .effects
                .iter()
                .find(|e| (e.start_ms < sequence_t as u32) && (e.end_ms >= sequence_t as u32));
            let effect = match effect_option {
                Some(e) => e,
                _ => continue,
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
                &sequence_t,
                &(sequence_t - effect.start_ms as u64),
                &((effect.end_ms - effect.start_ms) as u64),
                beat_t,
                frame,
                &effect.effect.as_ref().unwrap().effect.as_ref().unwrap(),
                color_palette,
            );
        }
    }
}
