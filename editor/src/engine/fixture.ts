import { Project } from "@dmx-controller/proto/project_pb";
import { getAllFixtures } from "./group";
import { OutputId, OutputId_FixtureMapping } from "@dmx-controller/proto/output_id_pb";
import { getActiveUniverse } from "../util/projectUtils";
import { LightTrack } from "@dmx-controller/proto/light_track_pb";
import { FixtureDefinition } from "@dmx-controller/proto/fixture_pb";

export type DmxUniverse = number[];

export type ColorChannel = 'red' | 'green' | 'blue' | 'white';

export type AngleChannel = 'pan' | 'tilt';

export type AmountChannel = 'brightness' | 'height' | 'strobe' | 'width' | 'zoom';

export type ChannelTypes = ColorChannel | AngleChannel | AmountChannel;

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
    project.fixtureDefinitions[physicalFixture.fixtureDefinitionId.toString()];
  // Check to ensure this fixture has a definition.
  if (definition == null) {
    return undefined;
  }

  const functionCollection: FunctionCollection = {
    manualFunctions: [],
    colorFunctions: [],
    angleFunctions: new Map(),
    amountFunctions: new Map(),
  };

  collectFunctions(physicalFixture.channelOffset, definition, functionCollection);
  return functionCollectionToDevice(functionCollection);
}

function getPhysicalWritableDeviceFromGroup(
  project: Project,
  groupId: bigint): WritableDevice | undefined {
  const group = project.groups[groupId.toString()];
  if (!group) {
    return undefined;
  }

  const functionCollection: FunctionCollection = {
    manualFunctions: [],
    colorFunctions: [],
    angleFunctions: new Map(),
    amountFunctions: new Map(),
  };

  getAllFixtures(project, groupId)
    .forEach(id => {
      const physicalFixture = getActiveUniverse(project).fixtures[id.toString()];
      const definition =
        project.fixtureDefinitions[physicalFixture.fixtureDefinitionId.toString()];
      collectFunctions(physicalFixture.channelOffset, definition, functionCollection);
    });

  return functionCollectionToDevice(functionCollection);
}

export function deleteFixture(project: Project, fixtureId: bigint) {
  // Delete from groups.
  for (const group of Object.values(project.groups)) {
    group.fixtures[project.activeUniverse.toString()].fixtures =
      group.fixtures[project.activeUniverse.toString()]
        .fixtures.filter(f => f !== fixtureId);
  }

  const deleteFromLightTrack = (t: LightTrack) => {
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
    .flatMap(s => s.rows)
    .flatMap(r => r.components)
    .forEach(c => {
      const description = c.description;
      if (description.case === 'effectGroup') {
        description.value.channels.forEach(c => {
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

function collectFunctions(fixtureIndex: number, definition: FixtureDefinition, collection: FunctionCollection) {
  collection.manualFunctions.push((universe, index, value) => {
    universe[fixtureIndex + index] = value;
  });

  for (const stringIndex in definition.channels) {
    const channel = definition.channels[stringIndex];
    const index = fixtureIndex + parseInt(stringIndex) - 1;
    const channelType = channel.type as ChannelTypes;
    switch (channelType) {
      case 'red':
        collection.colorFunctions.push((universe, r, _g, _b, _w) => {
          universe[index] = r * 255;
        });
        break;
      case 'green':
        collection.colorFunctions.push((universe, _r, g, _b, _w) => {
          universe[index] = g * 255;
        });
        break;
      case 'blue':
        collection.colorFunctions.push((universe, _r, _g, b, _w) => {
          universe[index] = b * 255;
        });
        break;
      case 'white':
        collection.colorFunctions.push((universe, _r, _g, _b, w) => {
          if (w != null) {
            universe[index] = w * 255;
          }
        });
        break;
      case 'pan':
      case 'tilt':
        if (collection.angleFunctions.get(channelType) == null) {
          collection.angleFunctions.set(channelType, []);
        }
        collection.angleFunctions.get(channelType).push((universe, d) => {
          universe[index] = mapDegrees(d, channel.minDegrees, channel.maxDegrees);
        });
        break;
      case 'brightness':
      case 'strobe':
      case 'zoom':
        if (collection.amountFunctions.get(channelType) == null) {
          collection.amountFunctions.set(channelType, []);
        }
        collection.amountFunctions.get(channelType).push((universe, a) => {
          universe[index] = (
            a * (channel.maxValue - channel.minValue) + channel.minValue
          ) % 256;
        });
        break;
      default:
        continue;
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
      collection.colorFunctions.forEach(f => f(universe, red, green, blue, white)),
    setAngle: (universe, type, angle) =>
      collection.angleFunctions.get(type)?.forEach(f => f(universe, angle)),
    setAmount: (universe, type, amount) =>
      collection.amountFunctions.get(type)?.forEach(f => f(universe, amount)),
  };
}

export function deleteFixtureGroup(project: Project, fixtureGroupId: bigint) {
  // Delete from groups.
  for (const group of Object.values(project.groups)) {
    group.groups =
      group.groups.filter(g => g !== fixtureGroupId);
  }

  const deleteFromLightTrack = (t: LightTrack) => {
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
    .flatMap(s => s.rows)
    .flatMap(r => r.components)
    .forEach(c => {
      const description = c.description;
      if (description.case === 'effectGroup') {
        description.value.channels.forEach(c => {
          if (c.outputId.output.case === 'group' && description.value.outputId.output.value === fixtureGroupId) {
            delete c.outputId;
          }
        });
      } else if (description.case === 'sequence') {
        description.value.lightTracks.forEach(deleteFromLightTrack);
      }
    });

  delete project.groups[fixtureGroupId.toString()];
}
