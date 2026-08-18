import {
  ArtnetDmxOutput,
  SacnDmxOutput,
  SerialDmxOutput,
} from '@dmx-controller/proto/output_pb';
import { Project } from '@dmx-controller/proto/project_pb';

export function getDmxFixtureChannels(
  project: Project,
  output: SerialDmxOutput | SacnDmxOutput | ArtnetDmxOutput,
  fixtureId: bigint,
) {
  const fixture = output.fixtures[fixtureId.toString()];
  const fixtureDefinition =
    project.fixtureDefinitions?.dmxFixtureDefinitions[
      fixture.fixtureDefinitionId.toString()
    ];
  const mode = fixtureDefinition?.modes[fixture.fixtureMode];
  return Object.values(mode?.channels || []).map((c) => c.type);
}
