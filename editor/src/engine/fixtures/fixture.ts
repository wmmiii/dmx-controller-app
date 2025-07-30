import { LightTrack } from '@dmx-controller/proto/light_track_pb';
import { Project } from '@dmx-controller/proto/project_pb';

import { getOutput } from '../../util/projectUtils';

import {
  OutputTarget,
  QualifiedFixtureId,
} from '@dmx-controller/proto/output_pb';
import { ALL_CHANNELS, ChannelTypes } from '../channel';
import { getAllFixtures } from '../group';
import { getFixtureChannels as getDmxFixtureChannels } from './dmxDevices';

export function getAvailableChannels(
  target: OutputTarget | undefined,
  project: Project,
): ChannelTypes[] {
  if (!target || !target.output.case) {
    return ALL_CHANNELS;
  }

  let fixtureIds: QualifiedFixtureId[];
  switch (target.output.case) {
    case 'fixtures':
      const id = target.output.value.fixtureIds.find(
        (id) => id.patch == project.activePatch,
      );
      if (!id) {
        return [];
      } else {
        fixtureIds = [id];
      }
      break;
    case 'group':
      fixtureIds = getAllFixtures(project, target.output.value);
      break;
    default:
      throw Error(
        `Unknown target type in getAvailableChannels! ${target['output']['case']}`,
      );
  }

  const channels: Set<ChannelTypes> = new Set();

  for (const fixtureId of fixtureIds) {
    const output = getOutput(project, fixtureId.output);
    switch (output.output.case) {
      case 'SerialDmxOutput':
        getDmxFixtureChannels(
          project,
          output.output.value,
          fixtureId.fixture,
        ).forEach((c) => channels.add(c));
    }
    output.output.case;
  }
  return Array.from(channels);
}

export function deleteFixture(project: Project, fixtureId: QualifiedFixtureId) {
  const deleteFromOutputTarget = (target: OutputTarget | undefined) => {
    if (target?.output.case === 'fixtures') {
      const fixtureIds = target.output.value.fixtureIds.filter(
        (id) =>
          id.patch !== fixtureId.patch ||
          id.output !== fixtureId.output ||
          id.fixture !== fixtureId.fixture,
      );
      target.output.value.fixtureIds = fixtureIds;
    }
  };

  // Delete from groups.
  for (const group of Object.values(project.groups)) {
    group.targets.forEach(deleteFromOutputTarget);
  }

  const deleteFromLightTrack = (t: LightTrack) => {
    deleteFromOutputTarget(t.outputTarget);
  };

  // Delete from shows.
  project.shows.flatMap((s) => s.lightTracks).forEach(deleteFromLightTrack);

  // Delete from scenes.
  project.scenes
    .flatMap((s) => s.tileMap)
    .map((r) => r.tile!)
    .forEach((t) => {
      const description = t.description;
      if (description.case === 'effectGroup') {
        description.value.channels.forEach((c) =>
          deleteFromOutputTarget(c.outputTarget),
        );
      } else if (description.case === 'sequence') {
        description.value.lightTracks.forEach(deleteFromLightTrack);
      }
    });

  const output = getOutput(project, fixtureId.output).output;
  switch (output.case) {
    case 'SerialDmxOutput':
      delete output.value.fixtures[fixtureId.fixture.toString()];
      break;
    default:
      throw Error(`Unknown output type in deleteFixture! ${output.case}`);
  }
}

export function mapDegrees(
  value: number,
  minDegrees: number,
  maxDegrees: number,
): number {
  return Math.max(
    Math.min((255 * (value - minDegrees)) / (maxDegrees - minDegrees), 255),
    0,
  );
}
