use crate::proto::{
    output::Output, Project, QualifiedFixtureId, SacnDmxOutput, SerialDmxOutput, WledOutput,
};

pub fn get_all_qualified_ids(project: &Project) -> Vec<QualifiedFixtureId> {
    project
        .patches
        .get(&project.active_patch)
        .unwrap()
        .outputs
        .iter()
        .flat_map(|(output_id, o)| {
            o.output
                .as_ref()
                .map(|out| match out {
                    Output::SacnDmxOutput(SacnDmxOutput { fixtures, .. })
                    | Output::SerialDmxOutput(SerialDmxOutput { fixtures, .. }) => fixtures
                        .iter()
                        .map(|(fixture_id, _)| QualifiedFixtureId {
                            patch: project.active_patch,
                            output: *output_id,
                            fixture: *fixture_id,
                        })
                        .collect::<Vec<_>>(),
                    Output::WledOutput(WledOutput { segments, .. }) => segments
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
        .collect()
}
