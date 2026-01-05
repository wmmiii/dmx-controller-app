use crate::proto::{
    output::Output, Project, QualifiedFixtureId, SacnDmxOutput, SerialDmxOutput, WledOutput,
};

impl Project {
    pub fn get_all_qualified_ids(&self) -> Vec<QualifiedFixtureId> {
        let patch_id = self.active_patch;

        let mut outputs: Vec<_> = self
            .patches
            .get(&patch_id)
            .unwrap()
            .outputs
            .iter()
            .collect();

        outputs.sort_by_key(|(output_id, _)| *output_id);

        outputs
            .into_iter()
            .flat_map(|(output_id, o)| {
                o.output
                    .as_ref()
                    .map(|out| match out {
                        Output::SacnDmxOutput(SacnDmxOutput { fixtures, .. })
                        | Output::SerialDmxOutput(SerialDmxOutput { fixtures, .. }) => {
                            let mut fixtures: Vec<_> = fixtures.iter().collect();
                            fixtures.sort_by_key(|(_, fixture)| fixture.channel_offset);
                            fixtures
                                .into_iter()
                                .map(|(fixture_id, _)| QualifiedFixtureId {
                                    patch: patch_id,
                                    output: *output_id,
                                    fixture: *fixture_id,
                                })
                                .collect::<Vec<_>>()
                        }
                        Output::WledOutput(WledOutput { segments, .. }) => {
                            let mut segments: Vec<_> = segments.iter().collect();
                            segments.sort_by_key(|(segment_id, _)| *segment_id);
                            segments
                                .into_iter()
                                .map(|(segment_id, _)| QualifiedFixtureId {
                                    patch: patch_id,
                                    output: *output_id,
                                    fixture: *segment_id as u64,
                                })
                                .collect::<Vec<_>>()
                        }
                    })
                    .into_iter()
                    .flatten()
            })
            .collect()
    }
}
