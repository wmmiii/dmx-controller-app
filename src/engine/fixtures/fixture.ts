import { Project } from '@dmx-controller/proto/project_pb';

import { deleteFromOutputTargets, getOutput } from '../../util/projectUtils';

import {
  OutputTarget,
  QualifiedFixtureId,
} from '@dmx-controller/proto/output_pb';
import {
  ALL_CHANNELS,
  AmountChannel,
  ChannelTypes,
  ColorChannel,
  WLED_CHANNELS,
} from '../channel';
import { getAllFixtures } from '../group';
import { getDmxFixtureChannels } from './dmxDevices';

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
      case 'sacnDmxOutput':
      case 'serialDmxOutput':
        getDmxFixtureChannels(
          project,
          output.output.value,
          fixtureId.fixture,
        ).forEach((c) => channels.add(c));
        break;
      case 'wledOutput':
        WLED_CHANNELS.forEach((c) => channels.add(c));
        const colorChannels: ColorChannel[] = ['red', 'green', 'blue'];
        colorChannels.forEach((c) => channels.add(c));
        const amountChannels: AmountChannel[] = ['dimmer'];
        amountChannels.forEach((c) => channels.add(c));
        break;
      default:
        throw Error('Tried to get channels of unknown output type!');
    }
    output.output.case;
  }
  return Array.from(channels);
}

export function deleteFixture(project: Project, fixtureId: QualifiedFixtureId) {
  deleteFromOutputTargets(
    project,
    (id) =>
      id.patch === fixtureId.patch ||
      id.output === fixtureId.output ||
      id.fixture === fixtureId.fixture,
  );

  const output = getOutput(project, fixtureId.output).output;
  switch (output.case) {
    case 'sacnDmxOutput':
    case 'serialDmxOutput':
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
