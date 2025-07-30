import { create } from '@bufbuild/protobuf';
import {
  OutputTarget,
  OutputTargetSchema,
  QualifiedFixtureId,
} from '@dmx-controller/proto/output_pb';
import { Project } from '@dmx-controller/proto/project_pb';
import { getOutput } from '../../util/projectUtils';
import { AmountChannel, AngleChannel } from '../channel';
import { WritableOutput } from '../context';
import { getAllFixtures } from '../group';
import { getDmxWritableDevice } from './dmxDevices';

export const GROUP_ALL_ID = 0n;

export interface WritableDevice {
  // GENERIC

  /**
   * Sets the color based on a [0, 1] value for red, green, and blue.
   */
  setColor(
    output: WritableOutput,
    red: number,
    green: number,
    blue: number,
    white?: number,
  ): void;

  /**
   * Sets a fixture angle based on degrees.
   */
  setAngle(output: WritableOutput, type: AngleChannel, angle: number): void;

  /**
   * Sets an amount based on a [0, 1] value.
   */
  setAmount(output: WritableOutput, type: AmountChannel, amount: number): void;

  // DMX SPECIFIC

  /**
   * Manually overrides a DMX channel. Valid numbers are [0, 255].
   */
  setChannel(output: WritableOutput, index: number, value: number): void;
}

export const NULL_WRITABLE_DEVICE: WritableDevice = {
  setColor: () => {},
  setAngle: () => {},
  setAmount: () => {},
  setChannel: () => {},
};

export class WritableDeviceCache {
  private readonly project: Project;
  private readonly outputId: bigint;
  private readonly cache = new Map<OutputTarget, WritableDevice | null>();

  constructor(project: Project, outputId: bigint) {
    this.project = project;
    this.outputId = outputId;
  }

  get(target: OutputTarget) {
    const cached = this.cache.get(target);
    if (cached) {
      return cached;
    }

    const device = getWritableDevice(this.project, this.outputId, target, this);
    this.cache.set(target, device);
    return device;
  }
}

function getWritableDevice(
  project: Project,
  outputId: bigint,
  outputTarget: OutputTarget,
  cache: WritableDeviceCache,
) {
  switch (outputTarget.output.case) {
    case 'fixtures':
      const fixtureId = outputTarget.output.value.fixtureIds.find(
        (id) => id.patch === project.activePatch,
      );
      // Check if this output is defined for the current patch and is the active output.
      if (fixtureId == null || fixtureId.output != outputId) {
        return null;
      }
      return getPhysicalWritableDevice(project, fixtureId);
    case 'group':
      return getPhysicalWritableDeviceFromGroup(
        project,
        outputTarget.output.value,
        cache,
      );
    case undefined:
      return NULL_WRITABLE_DEVICE;
    default:
      throw new Error(
        'Unknown writable device: ' + outputTarget['output']['case'],
      );
  }
}

function getPhysicalWritableDevice(
  project: Project,
  fixtureId: QualifiedFixtureId,
): WritableDevice | null {
  const output = getOutput(project, fixtureId.output);
  if (
    output.output.case === undefined ||
    output.output.case !== 'SerialDmxOutput'
  ) {
    console.error(
      'Unsupported output type when trying to get writable device:' +
        output.output.case,
    );
    return null;
  }
  const physicalFixture =
    output.output.value.fixtures[fixtureId.fixture.toString()];
  return getDmxWritableDevice(project, physicalFixture);
}

function getPhysicalWritableDeviceFromGroup(
  project: Project,
  groupId: bigint,
  cache: WritableDeviceCache,
): WritableDevice | null {
  const fixtures: WritableDevice[] = [];

  if (groupId === GROUP_ALL_ID) {
    Object.values(getAllFixtures(project, GROUP_ALL_ID)).forEach(
      (fixtureId) => {
        const device = cache.get(
          create(OutputTargetSchema, {
            output: {
              case: 'fixtures',
              value: {
                fixtureIds: [fixtureId],
              },
            },
          }),
        );
        if (device) {
          fixtures.push(device);
        }
      },
    );
  } else {
    const group = project.groups[groupId.toString()];
    if (!group) {
      return null;
    }

    getAllFixtures(project, groupId).forEach((id) => {
      const device = cache.get(
        create(OutputTargetSchema, {
          output: {
            case: 'fixtures',
            value: {
              fixtureIds: [id],
            },
          },
        }),
      );
      if (device) {
        fixtures.push(device);
      }
    });
  }

  return {
    setColor: (output, red, green, blue, white) =>
      fixtures.forEach((f) => f.setColor(output, red, green, blue, white)),
    setAngle: (output, type, angle) =>
      fixtures.forEach((f) => f.setAngle(output, type, angle)),
    setAmount: (output, type, amount) =>
      fixtures.forEach((f) => f.setAmount(output, type, amount)),
    setChannel: (output, index, value) =>
      fixtures.forEach((f) => f.setChannel(output, index, value)),
  };
}
