import { Project } from "@dmx-controller/proto/project_pb";
import { getAllFixtures } from "./group";
import { OutputId, OutputId_FixtureMapping } from "@dmx-controller/proto/output_id_pb";
import { getActiveUniverse } from "../util/projectUtils";
import { LightTrack } from "@dmx-controller/proto/light_track_pb";
import { FixtureDefinition_Channel_ColorWheelMapping, FixtureDefinition_Mode, PhysicalFixture } from "@dmx-controller/proto/fixture_pb";
import { AmountChannel, AngleChannel, ChannelTypes, COLOR_CHANNELS, isAmountChannel, isAngleChannel } from "./channel";

export type DmxUniverse = number[];

export const GROUP_ALL_ID = 0n;

export interface WritableDevice {
  /**
   * Manually overrides a channel. Valid numbers are [0, 255].
   */
  setChannel(universe: DmxUniverse, index: number, value: number): void;

  /**
   * Sets the color based on a [0, 1] value for red, green, and blue.
   */
  setColor(universe: DmxUniverse, red: number, green: number, blue: number, white?: number): void;

  /**
   * Sets a fixture angle based on degrees.
   */
  setAngle(universe: DmxUniverse, type: AngleChannel, angle: number): void;

  /**
   * Sets an amount based on a [0, 1] value.
   */
  setAmount(universe: DmxUniverse, type: AmountChannel, amount: number): void;

}

export function getWritableDevice(project: Project, outputId: OutputId) {
  switch (outputId.output.case) {
    case 'fixtures':
      return getPhysicalWritableDevice(project, outputId.output.value);
    case 'group':
      return getPhysicalWritableDeviceFromGroup(project, outputId.output.value);
    default:
      throw new Error('Unknown writable device: ' + outputId.output.case);
  }
}

function getPhysicalWritableDevice(
  project: Project,
  fixtureMapping: OutputId_FixtureMapping): WritableDevice | undefined {
  const activeUniverseId = project.activeUniverse.toString();
  const fixtureId = fixtureMapping.fixtures[activeUniverseId];
  // Check if this output is defined for the current universe.
  if (fixtureId == null) {
    return undefined;
  }
  const physicalFixture = getActiveUniverse(project).fixtures[fixtureId.toString()];
  const definition =
    project.fixtureDefinitions[physicalFixture.fixtureDefinitionId];
  // Check to ensure this fixture has a definition.
  if (definition == null) {
    return undefined;
  }

  const mode = definition.modes[physicalFixture.fixtureMode];
  if (mode == null) {
    return undefined;
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

function getPhysicalWritableDeviceFromGroup(
  project: Project,
  groupId: bigint): WritableDevice | undefined {
  const functionCollection: FunctionCollection = {
    manualFunctions: [],
    colorFunctions: [],
    angleFunctions: new Map(),
    amountFunctions: new Map(),
  };

  if (groupId === GROUP_ALL_ID) {
    Object.values(getActiveUniverse(project).fixtures)
      .sort((a, b) => a.channelOffset - b.channelOffset)
      .forEach(f => collectFunctions(f, project.fixtureDefinitions[f.fixtureDefinitionId].modes[f.fixtureMode], functionCollection));
  } else {
    const group = project.groups[groupId.toString()];
    if (!group) {
      return undefined;
    }

    getAllFixtures(project, groupId)
      .forEach(id => {
        const physicalFixture = getActiveUniverse(project).fixtures[id.toString()];
        const definition =
          project.fixtureDefinitions[physicalFixture.fixtureDefinitionId];
        const mode = definition.modes[physicalFixture.fixtureMode];
        collectFunctions(physicalFixture, mode, functionCollection);
      });
  }

  return functionCollectionToDevice(functionCollection);
}

export function getAvailableChannels(outputId: OutputId | undefined, project: Project): ChannelTypes[] {
  let fixtureIds: BigInt[];
  if (outputId?.output.case === 'fixtures') {
    fixtureIds = [outputId.output.value.fixtures[String(project.activeUniverse)]];
  } else if (outputId?.output.case === 'group') {
    fixtureIds = getAllFixtures(project, outputId.output.value);
  } else {
    fixtureIds = Object.keys(getActiveUniverse(project).fixtures).map(id => BigInt(id));
  }

  const channels = new Set(fixtureIds
    .map(id => getActiveUniverse(project).fixtures[String(id)])
    .filter(pf => pf != null)
    .map(pf => project.fixtureDefinitions[pf.fixtureDefinitionId]?.modes[pf.fixtureMode])
    .filter(m => m != null)
    .flatMap(mode => Object.values(mode.channels))
    .map(c => c.type));
  return Array.from(channels);
}

export function deleteFixture(project: Project, fixtureId: bigint) {
  // Delete from groups.
  for (const group of Object.values(project.groups)) {
    const fixtureList = group.fixtures[project.activeUniverse.toString()];
    if (fixtureList) {
      fixtureList.fixtures = fixtureList.fixtures.filter(f => f !== fixtureId);
    }
  }

  const deleteFromLightTrack = (t: LightTrack) => {
    if (t.outputId == null) {
      return;
    }
    if (t.outputId.output.case === 'fixtures') {
      if (t.outputId.output.value.fixtures[project.activeUniverse.toString()] === fixtureId) {
        delete t.outputId.output.value.fixtures[project.activeUniverse.toString()];
      }
    }
  };

  // Delete from shows.
  project.shows
    .flatMap(s => s.lightTracks)
    .forEach(deleteFromLightTrack);

  // Delete from scenes.
  project.scenes
    .flatMap(s => s.componentMap)
    .map(r => r.component!)
    .forEach(c => {
      const description = c.description;
      if (description.case === 'effectGroup') {
        description.value.channels.forEach(c => {
          if (c.outputId == null) {
            return;
          }
          if (c.outputId.output.case === 'fixtures') {
            const fixtures = c.outputId.output.value.fixtures;
            delete fixtures[project.activeUniverse.toString()];
          }
        });
      } else if (description.case === 'sequence') {
        description.value.lightTracks.forEach(deleteFromLightTrack);
      }
    });

  delete getActiveUniverse(project).fixtures[fixtureId.toString()];
}

interface FunctionCollection {
  manualFunctions: Array<(universe: DmxUniverse, index: number, value: number) => void>;
  colorFunctions: Array<(universe: DmxUniverse, r: number, g: number, b: number, w: number) => void>;
  angleFunctions: Map<AngleChannel, Array<(universe: DmxUniverse, a: number) => void>>;
  amountFunctions: Map<AmountChannel, Array<(universe: DmxUniverse, a: number) => void>>;
}

function collectFunctions(fixture: PhysicalFixture, mode: FixtureDefinition_Mode, collection: FunctionCollection) {
  collection.manualFunctions.push((universe, index, value) => {
    universe[fixture.channelOffset + index] = value;
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
      functions.push((universe, d) => {
        if (channel.mapping.case === 'angleMapping') {
          universe[index] = mapDegrees(
            d + offset,
            channel.mapping.value.minDegrees,
            channel.mapping.value.maxDegrees);
        }

      });
    } else if (isAmountChannel(channelType)) {
      if (collection.amountFunctions.get(channelType) == null) {
        collection.amountFunctions.set(channelType, []);
      } const functions = collection.amountFunctions.get(channelType);
      if (functions == null) {
        throw new Error('Amount channel does not have function map defined!');
      }
      functions.push((universe, a) => {
        if (channel.mapping.case === 'amountMapping') {
          universe[index] = (
            a * (channel.mapping.value.maxValue - channel.mapping.value.minValue) + channel.mapping.value.minValue
          ) % 256;
        }
      });
    }
  }
}

export function mapDegrees(value: number, minDegrees: number, maxDegrees: number): number {
  return Math.max(
    Math.min(
      255 * (value - minDegrees) / (maxDegrees - minDegrees),
      255),
    0);
}

function functionCollectionToDevice(collection: FunctionCollection): WritableDevice {
  return {
    setChannel: (universe, index, value) =>
      collection.manualFunctions.forEach(f => f(universe, index, value)),
    setColor: (universe, red, green, blue, white) =>
      collection.colorFunctions.forEach(f => f(universe, red, green, blue, white || 0)),
    setAngle: (universe, type, angle) =>
      collection.angleFunctions.get(type)?.forEach(f => f(universe, angle)),
    setAmount: (universe, type, amount) =>
      collection.amountFunctions.get(type)?.forEach(f => f(universe, amount)),
  };
}

export function deleteFixtureGroup(project: Project, fixtureGroupId: bigint) {
  if (fixtureGroupId === GROUP_ALL_ID) {
    return;
  }

  // Delete from groups.
  for (const group of Object.values(project.groups)) {
    group.groups =
      group.groups.filter(g => g !== fixtureGroupId);
  }

  const deleteFromLightTrack = (t: LightTrack) => {
    if (t.outputId == null) {
      throw new Error("Tried to delete track without output ID!");
    }
    if (t.outputId.output.case === 'group') {
      if (t.outputId.output.value === fixtureGroupId) {
        delete t.outputId;
      }
    }
  };

  // Delete from shows.
  project.shows
    .flatMap(s => s.lightTracks)
    .forEach(deleteFromLightTrack);

  // Delete from scenes.
  project.scenes
    .flatMap(s => s.componentMap)
    .map(c => c.component!)
    .forEach(c => {
      const description = c.description;
      if (description.case === 'effectGroup') {
        description.value.channels.forEach(c => {
          if (c.outputId == null) {
            throw new Error('Tried to delete channel without output ID!');
          }
          if (c.outputId.output.case === 'group' && c.outputId.output.value === fixtureGroupId) {
            delete c.outputId;
          }
        });
      } else if (description.case === 'sequence') {
        description.value.lightTracks.forEach(deleteFromLightTrack);
      }
    });

  delete project.groups[fixtureGroupId.toString()];
}

function collectColorChannels(
  channelType: String,
  index: number,
  modeIndex: number,
  mode: FixtureDefinition_Mode,
  collection: FunctionCollection) {
  const hasWhite = 'white' in Object.values(mode.channels);
  switch (channelType) {
    case 'red':
      if (hasWhite) {
        collection.colorFunctions.push((universe, r, _g, _b, _w) => {
          universe[index] = r * 255;
        });
      } else {
        collection.colorFunctions.push((universe, r, _g, _b, w) => {
          universe[index] = Math.floor(r * 255 + w * 255);
        });
      }
      break;
    case 'green':
      if (hasWhite) {
        collection.colorFunctions.push((universe, _r, g, _b, _w) => {
          universe[index] = g * 255;
        });
      } else {
        collection.colorFunctions.push((universe, _r, g, _b, w) => {
          universe[index] = Math.floor(g * 255 + w * 255);
        });
      }
      break;
    case 'blue':
      if (hasWhite) {
        collection.colorFunctions.push((universe, _r, _g, b, _w) => {
          universe[index] = b * 255;
        });
      } else {
        collection.colorFunctions.push((universe, _r, _g, b, w) => {
          universe[index] = Math.floor(b * 255 + w * 255);
        });
      }
      break;
    case 'cyan':
      collection.colorFunctions.push((universe, r, _g, _b, _w) => {
        universe[index] = (1 - r) * 255;
      });
      break;
    case 'magenta':
      collection.colorFunctions.push((universe, _r, g, _b, _w) => {
        universe[index] = (1 - g) * 255;
      });
      break;
    case 'yellow':
      collection.colorFunctions.push((universe, _r, _g, b, _w) => {
        universe[index] = (1 - b) * 255;
      });
      break;
    case 'white':
      collection.colorFunctions.push((universe, _r, _g, _b, w) => {
        if (w != null) {
          universe[index] = w * 255;
        }
      });
      break;
    case 'color_wheel':
      // Check to see if this fixture only supports a color wheel.
      if (Object.values(mode.channels)
        .map((c) => c.type)
        .findIndex((c => c in COLOR_CHANNELS)) < 0) {
        const mapping = mode.channels[modeIndex].mapping.value as FixtureDefinition_Channel_ColorWheelMapping;
        collection.colorFunctions.push((universe, r, g, b) => {
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
