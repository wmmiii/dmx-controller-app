import {
  DmxFixtureDefinition_Channel_ColorWheelMapping,
  DmxFixtureDefinition_Mode,
  PhysicalDmxFixture,
} from '@dmx-controller/proto/dmx_pb';
import { SacnDmxOutput, SerialDmxOutput } from '@dmx-controller/proto/output_pb';
import { Project } from '@dmx-controller/proto/project_pb';
import { getOutput } from '../../util/projectUtils';
import {
  AmountChannel,
  AngleChannel,
  COLOR_CHANNELS,
  ChannelTypes,
  isAmountChannel,
  isAngleChannel,
} from '../channel';
import { WritableDmxOutput } from '../context';
import { DmxUniverse } from '../outputs/dmxOutput';
import { mapDegrees } from './fixture';
import { NULL_WRITABLE_DEVICE, WritableDevice } from './writableDevice';

interface FunctionCollection {
  manualFunctions: Array<
    (output: WritableDmxOutput, index: number, value: number) => void
  >;
  colorFunctions: Array<
    (
      output: WritableDmxOutput,
      r: number,
      g: number,
      b: number,
      w: number,
    ) => void
  >;
  angleFunctions: Map<
    AngleChannel,
    Array<(output: WritableDmxOutput, a: number) => void>
  >;
  amountFunctions: Map<
    AmountChannel,
    Array<(output: WritableDmxOutput, a: number) => void>
  >;
}

export function getDmxWritableDevice(
  project: Project,
  physicalFixture: PhysicalDmxFixture,
): WritableDevice {
  const definition =
    project.fixtureDefinitions?.dmxFixtureDefinitions[
    physicalFixture.fixtureDefinitionId.toString()
    ];
  // Check to ensure this fixture has a definition.
  if (definition == null) {
    return NULL_WRITABLE_DEVICE;
  }

  const mode = definition.modes[physicalFixture.fixtureMode];
  if (mode == null) {
    return NULL_WRITABLE_DEVICE;
  }

  const functionCollection: FunctionCollection = {
    manualFunctions: [],
    colorFunctions: [],
    angleFunctions: new Map(),
    amountFunctions: new Map(),
  };

  collectFunctions(physicalFixture, mode, functionCollection);
  return functionCollectionToDevice(functionCollection);
}

function collectFunctions(
  fixture: PhysicalDmxFixture,
  mode: DmxFixtureDefinition_Mode,
  collection: FunctionCollection,
) {
  collection.manualFunctions.push((output: WritableDmxOutput, index, value) => {
    output.universe[fixture.channelOffset + index] = value;
  });

  for (const stringIndex in mode.channels) {
    const channel = mode.channels[stringIndex];
    const modeIndex = parseInt(stringIndex);
    const index = fixture.channelOffset + modeIndex - 1;
    const channelType = channel.type as ChannelTypes;
    collectColorChannels(channelType, index, modeIndex, mode, collection);
    if (isAngleChannel(channelType)) {
      if (collection.angleFunctions.get(channelType) == null) {
        collection.angleFunctions.set(channelType, []);
      }
      const offset = fixture.channelOffsets[channelType] || 0;
      const functions = collection.angleFunctions.get(channelType);
      if (functions == null) {
        throw new Error('Angle channel does not have function map defined!');
      }
      functions.push(({ universe }, d) => {
        if (channel.mapping.case === 'angleMapping') {
          universe[index] = mapDegrees(
            d + offset,
            channel.mapping.value.minDegrees,
            channel.mapping.value.maxDegrees,
          );
        }
      });
    } else if (isAmountChannel(channelType)) {
      if (collection.amountFunctions.get(channelType) == null) {
        collection.amountFunctions.set(channelType, []);
      }
      const functions = collection.amountFunctions.get(channelType);
      if (functions == null) {
        throw new Error('Amount channel does not have function map defined!');
      }
      functions.push(({ universe }, a) => {
        if (channel.mapping.case === 'amountMapping') {
          universe[index] =
            (a *
              (channel.mapping.value.maxValue -
                channel.mapping.value.minValue) +
              channel.mapping.value.minValue) %
            256;
        }
      });
    }
  }
}

function collectColorChannels(
  channelType: String,
  index: number,
  modeIndex: number,
  mode: DmxFixtureDefinition_Mode,
  collection: FunctionCollection,
) {
  const hasWhite = 'white' in Object.values(mode.channels);
  switch (channelType) {
    case 'red':
      if (hasWhite) {
        collection.colorFunctions.push(({ universe }, r, _g, _b, _w) => {
          universe[index] = r * 255;
        });
      } else {
        collection.colorFunctions.push(({ universe }, r, _g, _b, w) => {
          universe[index] = Math.floor(r * 255 + w * 255);
        });
      }
      break;
    case 'green':
      if (hasWhite) {
        collection.colorFunctions.push(({ universe }, _r, g, _b, _w) => {
          universe[index] = g * 255;
        });
      } else {
        collection.colorFunctions.push(({ universe }, _r, g, _b, w) => {
          universe[index] = Math.floor(g * 255 + w * 255);
        });
      }
      break;
    case 'blue':
      if (hasWhite) {
        collection.colorFunctions.push(({ universe }, _r, _g, b, _w) => {
          universe[index] = b * 255;
        });
      } else {
        collection.colorFunctions.push(({ universe }, _r, _g, b, w) => {
          universe[index] = Math.floor(b * 255 + w * 255);
        });
      }
      break;
    case 'cyan':
      collection.colorFunctions.push(({ universe }, r, _g, _b, _w) => {
        universe[index] = (1 - r) * 255;
      });
      break;
    case 'magenta':
      collection.colorFunctions.push(({ universe }, _r, g, _b, _w) => {
        universe[index] = (1 - g) * 255;
      });
      break;
    case 'yellow':
      collection.colorFunctions.push(({ universe }, _r, _g, b, _w) => {
        universe[index] = (1 - b) * 255;
      });
      break;
    case 'white':
      collection.colorFunctions.push(({ universe }, _r, _g, _b, w) => {
        if (w != null) {
          universe[index] = w * 255;
        }
      });
      break;
    case 'color_wheel':
      // Check to see if this fixture only supports a color wheel.
      if (
        Object.values(mode.channels)
          .map((c) => c.type)
          .findIndex((c) => c in COLOR_CHANNELS) < 0
      ) {
        const mapping = mode.channels[modeIndex].mapping
          .value as DmxFixtureDefinition_Channel_ColorWheelMapping;
        collection.colorFunctions.push(({ universe }, r, g, b) => {
          let wheelSlot = 0;
          let minDist = 100;
          for (const slot of mapping.colors) {
            const color = slot.color!;
            const rDist = color.red - r;
            const gDist = color.green - g;
            const bDist = color.blue - b;
            const dist = rDist * rDist + gDist * gDist + bDist * bDist;

            if (dist < minDist) {
              minDist = dist;
              wheelSlot = slot.value;
            }
          }
          universe[index] = wheelSlot;
        });
      }
  }
}

function functionCollectionToDevice(
  collection: FunctionCollection,
): WritableDevice {
  return {
    setDmxChannel: (output, index, value) =>
      collection.manualFunctions.forEach((f) => {
        if (output.type === 'dmx') {
          f(output, index, value);
        }
      }),
    setColor: (output, red, green, blue, white) =>
      collection.colorFunctions.forEach((f) => {
        if (output.type === 'dmx') {
          f(output, red, green, blue, white || 0);
        }
      }),
    setAngle: (output, type, angle) =>
      collection.angleFunctions.get(type)?.forEach((f) => {
        if (output.type === 'dmx') {
          f(output, angle);
        }
      }),
    setAmount: (output, type, amount) =>
      collection.amountFunctions.get(type)?.forEach((f) => {
        if (output.type === 'dmx') {
          f(output, amount);
        }
      }),
    setWledEffect: () => { },
    setWledPalette: () => { },
  };
}

export function getDmxFixtureChannels(
  project: Project,
  output: SerialDmxOutput | SacnDmxOutput,
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

export function universeToUint8Array(
  project: Project,
  outputId: bigint,
  universe: DmxUniverse,
) {
  const out = new Uint8Array(512);
  for (let i = 0; i < 512; ++i) {
    out[i] = Math.floor(universe[i]);
  }

  const output = getOutput(project, outputId);
  if (output.output.case !== 'serialDmxOutput' && output.output.case !== 'sacnDmxOutput') {
    throw Error(
      `Cannot convert output of type ${output.output.case} to universe uint8 array!`,
    );
  }

  Object.values(output.output.value.fixtures).forEach((f) => {
    if (!project.fixtureDefinitions) {
      throw Error('No fixture definitions found in project!');
    }
    const d =
      project.fixtureDefinitions.dmxFixtureDefinitions[
      f.fixtureDefinitionId.toString()
      ];
    if (d == null) {
      return;
    }
    const m = d.modes[f.fixtureMode];
    for (const channel of Object.entries(m.channels)) {
      const type = channel[1].type;
      if (type.indexOf('-fine') > -1) {
        const fineIndex = parseInt(channel[0]) + f.channelOffset - 1;
        const coarseType = type.substring(0, type.length - 5) as ChannelTypes;
        const courseEntry = Object.entries(m.channels).find(
          (t) => t[1].type === coarseType,
        );
        if (courseEntry == null) {
          continue;
        }
        const coarseIndex = parseInt(courseEntry[0]) + f.channelOffset - 1;
        const coarseValue = universe[coarseIndex];
        out[fineIndex] = Math.floor(coarseValue * 255) % 255;
      }
    }
  });

  return out;
}
