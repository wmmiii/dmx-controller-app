#![allow(clippy::cast_precision_loss)]

use crate::{
    proto::{
        ColorPalette, EffectTiming, FixtureState, OutputTarget, Project, QualifiedFixtureId,
        effect::Effect,
        effect_timing::{Absolute, Beat, EasingFunction, PhaseType, Timing},
        output_target::{FixtureMapping, Output},
    },
    render::{
        preset_effect::apply_preset_effect, ramp_effect::apply_ramp_effect,
        random_effect::apply_random_effect, render_target::RenderTarget,
        sequence_effect::apply_sequence_effect, strobe_effect::apply_strobe_effect,
    },
};
use std::collections::HashMap;
use std::f64::consts::PI;

/// Information about a fixture within its group.
#[derive(Debug, Clone)]
pub struct FixtureInfo {
    /// The index of this fixture within its group (0, 1, 2, 3, ...).
    pub index: usize,
    /// The phase as a fraction: `index / group_size` (0.0, 0.25, 0.50, 0.75 for a 4-fixture group).
    pub phase: f64,
    /// The output target for this specific fixture.
    pub output_target: OutputTarget,
}

pub fn apply_effect<T: RenderTarget<T>>(
    project: &Project,
    render_target: &mut T,
    output_target: &OutputTarget,
    system_t: u64,
    effect_t: Option<&f64>,
    beat_t: f64,
    frame: u32,
    effect: &Effect,
    color_palette: &ColorPalette,
) {
    match effect {
        Effect::RampEffect(ramp_effect) => apply_ramp_effect(
            project,
            render_target,
            output_target,
            system_t,
            effect_t,
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
        Effect::SequenceEffect(sequence_effect) => apply_sequence_effect(
            project,
            render_target,
            output_target,
            system_t,
            effect_t,
            beat_t,
            frame,
            sequence_effect,
            color_palette,
        ),
        Effect::PresetEffect(preset_effect) => apply_preset_effect(
            project,
            render_target,
            output_target,
            system_t,
            effect_t,
            beat_t,
            preset_effect,
            color_palette,
        ),
    }
}

pub fn apply_state<T: RenderTarget<T>>(
    project: &Project,
    render_target: &mut T,
    output_target: &OutputTarget,
    state: &FixtureState,
    color_palette: &ColorPalette,
) {
    let Some(output) = &output_target.output else {
        return;
    };

    match output {
        Output::Fixtures(f) => {
            if let Some(qid) = f
                .fixture_ids
                .iter()
                .find(|id| id.patch == project.active_patch)
            {
                render_target.apply_state(qid, state, color_palette);
            }
        }
        Output::Group(0) => {
            for fixture_id in project.get_all_qualified_ids() {
                apply_state(
                    project,
                    render_target,
                    &OutputTarget {
                        output: Some(Output::Fixtures(FixtureMapping {
                            fixture_ids: [fixture_id].to_vec(),
                        })),
                    },
                    state,
                    color_palette,
                );
            }
        }
        Output::Group(id) => {
            if let Some(g) = project.groups.get(id) {
                for target in &g.targets {
                    apply_state(project, render_target, target, state, color_palette);
                }
            }
        }
    }
}

pub fn get_fixtures(
    project: &Project,
    output_target: &OutputTarget,
) -> HashMap<QualifiedFixtureId, FixtureInfo> {
    let Some(output) = &output_target.output else {
        return HashMap::new();
    };

    match output {
        Output::Fixtures(f) => {
            // fixture_ids is a map from patch to fixture; only one will match the active patch
            let Some(&id) = f
                .fixture_ids
                .iter()
                .find(|id| id.patch == project.active_patch)
            else {
                return HashMap::new();
            };

            let mut result = HashMap::new();
            result.insert(
                id,
                FixtureInfo {
                    index: 0,
                    phase: 0.0,
                    output_target: OutputTarget {
                        output: Some(Output::Fixtures(FixtureMapping {
                            fixture_ids: vec![id],
                        })),
                    },
                },
            );
            result
        }

        Output::Group(0) => {
            let all_ids = project.get_all_qualified_ids();
            let count = all_ids.len();

            all_ids
                .into_iter()
                .enumerate()
                .map(|(i, id)| {
                    (
                        id,
                        FixtureInfo {
                            index: i,
                            phase: if count > 0 { i as f64 / count as f64 } else { 0.0 },
                            output_target: OutputTarget {
                                output: Some(Output::Fixtures(FixtureMapping {
                                    fixture_ids: vec![id],
                                })),
                            },
                        },
                    )
                })
                .collect()
        }

        Output::Group(id) => {
            let Some(group) = project.groups.get(id) else {
                return HashMap::new();
            };

            // First pass: count direct fixture targets in this group
            let direct_fixture_count = group
                .targets
                .iter()
                .filter(|target| matches!(&target.output, Some(Output::Fixtures(_))))
                .count();

            // Second pass: build result with proper phases
            let mut result: HashMap<QualifiedFixtureId, FixtureInfo> = HashMap::new();
            let mut direct_index = 0;

            for target in &group.targets {
                match &target.output {
                    Some(Output::Fixtures(f)) => {
                        // Direct fixture in this group - assign phase based on sibling count
                        let Some(&id) = f
                            .fixture_ids
                            .iter()
                            .find(|fid| fid.patch == project.active_patch)
                        else {
                            continue;
                        };

                        result.insert(
                            id,
                            FixtureInfo {
                                index: direct_index,
                                phase: if direct_fixture_count > 0 {
                                    direct_index as f64 / direct_fixture_count as f64
                                } else {
                                    0.0
                                },
                                output_target: OutputTarget {
                                    output: Some(Output::Fixtures(FixtureMapping {
                                        fixture_ids: vec![id],
                                    })),
                                },
                            },
                        );
                        direct_index += 1;
                    }
                    Some(Output::Group(_)) => {
                        // Nested group - recurse; fixtures keep their phases from the nested group
                        let nested = get_fixtures(project, target);
                        result.extend(nested);
                    }
                    None => {}
                }
            }

            result
        }
    }
}

pub fn calculate_timing(
    effect_timing: &EffectTiming,
    system_t: u64,
    effect_t: Option<&f64>,
    beat_t: f64,
    group_phase: f64,
    fixture_index: usize,
) -> f64 {
    // Calculate based on timing mode.
    let mut t = match effect_timing.timing {
        Some(Timing::Absolute(Absolute { duration_ms })) => {
            system_t as f64 / f64::from(duration_ms)
        }
        Some(Timing::Beat(Beat { multiplier })) => beat_t / f64::from(multiplier),
        Some(Timing::OneShot(_)) => *effect_t.unwrap_or(&beat_t),
        None => panic!("Timing type not specified when trying to calculate timing!"),
    };

    // Modify with phase offset based on phase_type.
    // - AcrossGroup: phase is distributed across all fixtures (0.0 to 1.0 range)
    // - BetweenFixtures: each fixture is offset by phase relative to previous
    let phase_multiplier = match PhaseType::try_from(effect_timing.phase_type) {
        Ok(PhaseType::BetweenFixtures) => fixture_index as f64,
        _ => group_phase, // Default to AcrossGroup
    };
    t = (t + effect_timing.phase * phase_multiplier).fract();

    // Mirror if necessary.
    if effect_timing.mirrored && t < 0.5 {
        t *= 2.0;
    } else if effect_timing.mirrored {
        t = (1.0 - t) * 2.0;
    }

    // Ease.
    match EasingFunction::try_from(effect_timing.easing) {
        Ok(EasingFunction::Linear) => t,
        Ok(EasingFunction::EaseIn) => t * t * t,
        Ok(EasingFunction::EaseOut) => 1.0 - (1.0 - t).powf(3.0),
        Ok(EasingFunction::EaseInOut) => t * t * (3.0 - 2.0 * t),
        Ok(EasingFunction::Sine) => f64::midpoint(-(PI * t).cos(), 1.0),
        _ => panic!("Unknown easing type!"),
    }
}

pub fn interpolate_palettes(a: &ColorPalette, b: &ColorPalette, t: f64) -> ColorPalette {
    use crate::proto::{Color, ColorPalette, color_palette::ColorDescription};

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
            (Some(a_desc), None) => Some(*a_desc),
            (None, Some(b_desc)) => Some(*b_desc),
            (None, None) => None,
        }
    };

    ColorPalette {
        id: u64::MAX,
        name: b.name.clone(),
        primary: interpolate_desc(a.primary.as_ref(), b.primary.as_ref(), t),
        secondary: interpolate_desc(a.secondary.as_ref(), b.secondary.as_ref(), t),
        tertiary: interpolate_desc(a.tertiary.as_ref(), b.tertiary.as_ref(), t),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proto::{Project, TargetGroup};

    fn make_fixture_id(patch: u64, output: u64, fixture: u64) -> QualifiedFixtureId {
        QualifiedFixtureId {
            patch,
            output,
            fixture,
        }
    }

    fn make_fixture_target(patch: u64, output: u64, fixture: u64) -> OutputTarget {
        OutputTarget {
            output: Some(Output::Fixtures(FixtureMapping {
                fixture_ids: vec![make_fixture_id(patch, output, fixture)],
            })),
        }
    }

    fn make_group_target(group_id: u64) -> OutputTarget {
        OutputTarget {
            output: Some(Output::Group(group_id)),
        }
    }

    #[test]
    fn test_single_fixture_returns_phase_zero() {
        let mut project = Project::default();
        project.active_patch = 1;

        let target = make_fixture_target(1, 1, 100);
        let result = get_fixtures(&project, &target);

        assert_eq!(result.len(), 1);
        let info = result.get(&make_fixture_id(1, 1, 100)).unwrap();
        assert_eq!(info.index, 0);
        assert!((info.phase - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_single_fixture_wrong_patch_returns_empty() {
        let mut project = Project::default();
        project.active_patch = 2; // Different from fixture's patch

        let target = make_fixture_target(1, 1, 100);
        let result = get_fixtures(&project, &target);

        assert!(result.is_empty());
    }

    #[test]
    fn test_group_with_three_fixtures() {
        let mut project = Project::default();
        project.active_patch = 1;

        // Create a group with 3 direct fixtures
        let group = TargetGroup {
            name: "Test Group".to_string(),
            targets: vec![
                make_fixture_target(1, 1, 100),
                make_fixture_target(1, 1, 101),
                make_fixture_target(1, 1, 102),
            ],
        };
        project.groups.insert(1, group);

        let target = make_group_target(1);
        let result = get_fixtures(&project, &target);

        assert_eq!(result.len(), 3);

        let info_0 = result.get(&make_fixture_id(1, 1, 100)).unwrap();
        assert_eq!(info_0.index, 0);
        assert!((info_0.phase - 0.0).abs() < f64::EPSILON);

        let info_1 = result.get(&make_fixture_id(1, 1, 101)).unwrap();
        assert_eq!(info_1.index, 1);
        assert!((info_1.phase - 1.0 / 3.0).abs() < f64::EPSILON);

        let info_2 = result.get(&make_fixture_id(1, 1, 102)).unwrap();
        assert_eq!(info_2.index, 2);
        assert!((info_2.phase - 2.0 / 3.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_group_with_four_fixtures_phases() {
        let mut project = Project::default();
        project.active_patch = 1;

        // Create a group with 4 direct fixtures - should have phases 0, 0.25, 0.5, 0.75
        let group = TargetGroup {
            name: "Test Group".to_string(),
            targets: vec![
                make_fixture_target(1, 1, 100),
                make_fixture_target(1, 1, 101),
                make_fixture_target(1, 1, 102),
                make_fixture_target(1, 1, 103),
            ],
        };
        project.groups.insert(1, group);

        let target = make_group_target(1);
        let result = get_fixtures(&project, &target);

        assert_eq!(result.len(), 4);

        let info_0 = result.get(&make_fixture_id(1, 1, 100)).unwrap();
        assert_eq!(info_0.index, 0);
        assert!((info_0.phase - 0.0).abs() < f64::EPSILON);

        let info_1 = result.get(&make_fixture_id(1, 1, 101)).unwrap();
        assert_eq!(info_1.index, 1);
        assert!((info_1.phase - 0.25).abs() < f64::EPSILON);

        let info_2 = result.get(&make_fixture_id(1, 1, 102)).unwrap();
        assert_eq!(info_2.index, 2);
        assert!((info_2.phase - 0.5).abs() < f64::EPSILON);

        let info_3 = result.get(&make_fixture_id(1, 1, 103)).unwrap();
        assert_eq!(info_3.index, 3);
        assert!((info_3.phase - 0.75).abs() < f64::EPSILON);
    }

    #[test]
    fn test_nested_group_fixtures_keep_inner_phases() {
        let mut project = Project::default();
        project.active_patch = 1;

        // Inner group with 2 fixtures - should have phases 0, 0.5
        let inner_group = TargetGroup {
            name: "Inner Group".to_string(),
            targets: vec![
                make_fixture_target(1, 1, 200),
                make_fixture_target(1, 1, 201),
            ],
        };
        project.groups.insert(2, inner_group);

        // Outer group with 2 direct fixtures + nested group
        let outer_group = TargetGroup {
            name: "Outer Group".to_string(),
            targets: vec![
                make_fixture_target(1, 1, 100),
                make_fixture_target(1, 1, 101),
                make_group_target(2), // Nested group
            ],
        };
        project.groups.insert(1, outer_group);

        let target = make_group_target(1);
        let result = get_fixtures(&project, &target);

        assert_eq!(result.len(), 4);

        // Direct fixtures in outer group: phases based on 2 direct siblings
        let info_100 = result.get(&make_fixture_id(1, 1, 100)).unwrap();
        assert_eq!(info_100.index, 0);
        assert!((info_100.phase - 0.0).abs() < f64::EPSILON);

        let info_101 = result.get(&make_fixture_id(1, 1, 101)).unwrap();
        assert_eq!(info_101.index, 1);
        assert!((info_101.phase - 0.5).abs() < f64::EPSILON);

        // Nested group fixtures: phases based on 2 fixtures in inner group
        let info_200 = result.get(&make_fixture_id(1, 1, 200)).unwrap();
        assert_eq!(info_200.index, 0);
        assert!((info_200.phase - 0.0).abs() < f64::EPSILON);

        let info_201 = result.get(&make_fixture_id(1, 1, 201)).unwrap();
        assert_eq!(info_201.index, 1);
        assert!((info_201.phase - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn test_group_with_only_nested_groups() {
        let mut project = Project::default();
        project.active_patch = 1;

        // Group A with 2 fixtures
        let group_a = TargetGroup {
            name: "Group A".to_string(),
            targets: vec![
                make_fixture_target(1, 1, 100),
                make_fixture_target(1, 1, 101),
            ],
        };
        project.groups.insert(2, group_a);

        // Group B with 3 fixtures
        let group_b = TargetGroup {
            name: "Group B".to_string(),
            targets: vec![
                make_fixture_target(1, 1, 200),
                make_fixture_target(1, 1, 201),
                make_fixture_target(1, 1, 202),
            ],
        };
        project.groups.insert(3, group_b);

        // Parent group with only nested groups (no direct fixtures)
        let parent_group = TargetGroup {
            name: "Parent".to_string(),
            targets: vec![
                make_group_target(2),
                make_group_target(3),
            ],
        };
        project.groups.insert(1, parent_group);

        let target = make_group_target(1);
        let result = get_fixtures(&project, &target);

        assert_eq!(result.len(), 5);

        // Group A fixtures: phases 0/2, 1/2
        let info_100 = result.get(&make_fixture_id(1, 1, 100)).unwrap();
        assert!((info_100.phase - 0.0).abs() < f64::EPSILON);

        let info_101 = result.get(&make_fixture_id(1, 1, 101)).unwrap();
        assert!((info_101.phase - 0.5).abs() < f64::EPSILON);

        // Group B fixtures: phases 0/3, 1/3, 2/3
        let info_200 = result.get(&make_fixture_id(1, 1, 200)).unwrap();
        assert!((info_200.phase - 0.0).abs() < f64::EPSILON);

        let info_201 = result.get(&make_fixture_id(1, 1, 201)).unwrap();
        assert!((info_201.phase - 1.0 / 3.0).abs() < f64::EPSILON);

        let info_202 = result.get(&make_fixture_id(1, 1, 202)).unwrap();
        assert!((info_202.phase - 2.0 / 3.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_missing_group_returns_empty() {
        let project = Project::default();

        let target = make_group_target(999); // Non-existent group
        let result = get_fixtures(&project, &target);

        assert!(result.is_empty());
    }

    #[test]
    fn test_empty_output_target_returns_empty() {
        let project = Project::default();

        let target = OutputTarget { output: None };
        let result = get_fixtures(&project, &target);

        assert!(result.is_empty());
    }
}
