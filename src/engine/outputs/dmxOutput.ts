import { create } from '@bufbuild/protobuf';
import { OutputSchema } from '@dmx-controller/proto/output_pb';
import { Project } from '@dmx-controller/proto/project_pb';
import { getOutput } from '../../util/projectUtils';
import { WritableDmxOutput } from '../context';
import { universeToUint8Array } from '../fixtures/dmxDevices';
import { mapDegrees } from '../fixtures/fixture';

export type DmxUniverse = number[];

export function createNewSacnDmxOutput() {
  return create(OutputSchema, {
    name: 'DMX SACN Output',
    latencyMs: 0,
    output: {
      case: 'sacnDmxOutput',
      value: {
        ipAddress: '0.0.0.0',
        fixtures: {},
      },
    },
  });
}

export function createNewSerialDmxOutput() {
  return create(OutputSchema, {
    name: 'DMX Serial Output',
    latencyMs: 0,
    output: {
      case: 'serialDmxOutput',
      value: {
        fixtures: {},
      },
    },
  });
}

export function getDmxWritableOutput(
  project: Project,
  outputId: bigint,
): WritableDmxOutput {
  const universe = new Array(512).fill(0);
  const nonInterpolatedIndices = applyDefaults(project, outputId, universe);
  const latencyMs = getOutput(project, outputId).latencyMs;

  return {
    type: 'dmx',
    universe: universe,
    nonInterpolatedIndices: nonInterpolatedIndices,
    get uint8Array() {
      return universeToUint8Array(project, outputId, universe);
    },
    outputId: outputId,
    latencyMs: latencyMs,
    clone: () =>
      clone(project, outputId, latencyMs, universe, nonInterpolatedIndices),
    interpolate: (a, b, t) =>
      interpolateUniverses(
        universe,
        t,
        (a as WritableDmxOutput).universe,
        (b as WritableDmxOutput).universe,
        nonInterpolatedIndices,
      ),
  };
}

/** Applies default values to all indices and returns an array of non-interpolated channels; */
function applyDefaults(
  project: Project,
  outputId: bigint,
  universe: DmxUniverse,
): number[] {
  const nonInterpolatedIndices: number[] = [];
  const output = getOutput(project, outputId);
  if (
    output.output.case !== 'serialDmxOutput' &&
    output.output.case !== 'sacnDmxOutput'
  ) {
    throw Error('Tried to apply DMX defaults to non-DMX output!');
  }
  const fixtures = output.output.value.fixtures;
  for (const fixture of Object.values(fixtures)) {
    const fixtureDefinition =
      project.fixtureDefinitions?.dmxFixtureDefinitions[
        fixture.fixtureDefinitionId.toString()
      ];
    // Can happen if fixture has not yet set a definition.
    if (!fixtureDefinition) {
      continue;
    }

    const fixtureMode = fixtureDefinition.modes[fixture.fixtureMode];

    if (!fixtureMode) {
      continue;
    }

    for (const channel of Object.entries(fixtureMode.channels)) {
      const index = parseInt(channel[0]) - 1 + fixture.channelOffset;
      let value = channel[1].defaultValue;
      if (channel[1].mapping.case === 'angleMapping') {
        const mapping = channel[1].mapping.value;
        value += fixture.channelOffsets[channel[1].type] || 0;
        value = mapDegrees(value, mapping.minDegrees, mapping.maxDegrees);
      } else if (channel[1].mapping.case === 'colorWheelMapping') {
        nonInterpolatedIndices.push(index);
      }
      universe[index] = value;
    }
  }
  return nonInterpolatedIndices;
}

function clone(
  project: Project,
  outputId: bigint,
  latencyMs: number,
  universe: DmxUniverse,
  nonInterpolatedIndices: number[],
): WritableDmxOutput {
  const newUniverse = [...universe];
  return {
    type: 'dmx',
    universe: newUniverse,
    nonInterpolatedIndices: nonInterpolatedIndices,
    get uint8Array() {
      return universeToUint8Array(project, outputId, universe);
    },
    outputId: outputId,
    latencyMs: latencyMs,
    clone: () =>
      clone(project, outputId, latencyMs, newUniverse, nonInterpolatedIndices),
    interpolate: (a, b, t) =>
      interpolateUniverses(
        newUniverse,
        t,
        (a as WritableDmxOutput).universe,
        (b as WritableDmxOutput).universe,
        nonInterpolatedIndices,
      ),
  };
}

function interpolateUniverses(
  universe: DmxUniverse,
  t: number,
  start: DmxUniverse,
  end: DmxUniverse,
  nonInterpolatedIndices: number[],
) {
  for (let i = 0; i < universe.length; ++i) {
    if (nonInterpolatedIndices.indexOf(i) > -1) {
      universe[i] = t > 0.5 ? end[i] : start[i];
    } else {
      universe[i] = start[i] * (1 - t) + end[i] * t;
    }
  }
}
