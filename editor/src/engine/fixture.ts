import { Project } from "@dmx-controller/proto/project_pb";
import { getAllFixtures } from "./group";
import { FixtureState_StrobeSpeed } from "@dmx-controller/proto/effect_pb";
import { OutputId_FixtureMapping } from "@dmx-controller/proto/output_id_pb";
import { getActiveUniverse } from "../util/projectUtils";
import { LightTrack } from "@dmx-controller/proto/light_track_pb";

export type DmxUniverse = Uint8Array;

export type ChannelTypes =
  'other' |
  'red' |
  'red-fine' |
  'green' |
  'green-fine' |
  'blue' |
  'blue-fine' |
  'white' |
  'white-fine' |
  'brightness' |
  'brightness-fine' |
  'strobe' |
  'pan' |
  'pan-fine' |
  'tilt' |
  'tilt-fine' |
  'zoom';

export interface WritableDevice {
  /**
   * Manually overrides a channel. Valid numbers are [0, 255].
   */
  setChannel(index: number, value: number): void;

  /**
   * Sets the color based on a [0, 1] value for red, green, and blue.
   */
  setRGB(red: number, green: number, blue: number): void;

  /**
   * Sets the color based on a [0, 1] value for red, green, blue, and white.
   */
  setRGBW(red: number, green: number, blue: number, white: number): void;

  /**
   * Sets the brightness of the light based on a [0, 1] value.
   */
  setBrightness(brightness: number): void;

  /**
   * Sets the strobe amount of the light.
   */
  setStrobe(speed: FixtureState_StrobeSpeed): void;

  /**
   * Sets the pan based on a [0, 360] degree value.
   */
  setPan(degrees: number): void;

  /**
   * Sets the tilt based on a [0, 360] degree value.
   */
  setTilt(degrees: number): void;

  /**
   * Sets the zoom amount based on a [0, 1] value.
   */
  setZoom(amount: number): void;

  /**
   * Returns the type of all the channels according to this device.
   */
  readonly channelTypes: ChannelTypes[];
}

export function getPhysicalWritableDevice(
  project: Project,
  fixtureMapping: OutputId_FixtureMapping,
  universe: DmxUniverse): WritableDevice | undefined {
  const activeUniverseId = project.activeUniverse.toString();
  const fixtureId = fixtureMapping.fixtures[activeUniverseId];
  const physicalFixture = project.universes[activeUniverseId].fixtures[fixtureId.toString()];
  if (physicalFixture == null) {
    return undefined;
  }
  const definition =
    project.fixtureDefinitions[physicalFixture.fixtureDefinitionId];
  if (definition == null) {
    return undefined;
  }

  const rgbFunctions: Array<(r: number, g: number, b: number) => void> = [];
  const whiteFunctions: Array<(w: number) => void> = [];
  const brightnessFunctions: Array<(b: number) => void> = [];
  const strobeFunctions: Array<(s: FixtureState_StrobeSpeed) => void> = [];
  const panFunctions: Array<(d: number) => void> = [];
  const tiltFunctions: Array<(d: number) => void> = [];
  const zoomFunctions: Array<(z: number) => void> = [];

  const channelTypes: ChannelTypes[] = [];

  for (const stringIndex in definition.channels) {
    const channel = definition.channels[stringIndex];
    const index = physicalFixture.channelOffset + parseInt(stringIndex) - 1;
    channelTypes[index] = channel.type as ChannelTypes;
    switch (channel.type as ChannelTypes) {
      case 'red':
        rgbFunctions.push((r, _g, _b) => {
          universe[index] = r * 255;
        });
        break;
      case 'red-fine':
        rgbFunctions.push((r, _g, _b) => {
          universe[index] = (r * 65025) % 255;
        });
        break;
      case 'green':
        rgbFunctions.push((_r, g, _b) => {
          universe[index] = g * 255;
        });
        break;
      case 'green-fine':
        rgbFunctions.push((_r, g, _b) => {
          universe[index] = (g * 65025) % 255;
        });
        break;
      case 'blue':
        rgbFunctions.push((_r, _g, b) => {
          universe[index] = b * 255;
        });
        break;
      case 'blue-fine':
        rgbFunctions.push((_r, _g, b) => {
          universe[index] = (b * 65025) % 255;
        });
        break;
      case 'white':
        whiteFunctions.push((w) => {
          universe[index] = w * 255;
        });
        break;
      case 'white-fine':
        whiteFunctions.push((w) => {
          universe[index] = (w * 65025) % 255;
        });
        break;
      case 'brightness':
        brightnessFunctions.push((b) => {
          universe[index] = b * 255;
        });
        break;
      case 'brightness-fine':
        brightnessFunctions.push((b) => {
          universe[index] = (b * 65025) % 255;
        });
        break;
      case 'strobe':
        strobeFunctions.push((s) => {
          let amount: number;
          switch (s) {
            case FixtureState_StrobeSpeed.SLOW:
              amount = channel.strobe.slowStrobe ?? channel.strobe.fastStrobe ?? channel.defaultValue;
              break;
            case FixtureState_StrobeSpeed.FAST:
              amount = channel.strobe.fastStrobe ?? channel.strobe.slowStrobe ?? channel.defaultValue;
              break;
            default:
              amount = channel.strobe.noStrobe ?? channel.defaultValue;
          }
          universe[index] = amount;
        });
        break;
      case 'pan':
        panFunctions.push((d) => {
          universe[index] = mapDegrees(d, channel.minDegrees, channel.maxDegrees);
        });
        break;
      case 'pan-fine':
        panFunctions.push((d) => {
          universe[index] =
            (mapDegrees(d, channel.minDegrees, channel.maxDegrees) * 255) % 255;
        });
        break;
      case 'tilt':
        tiltFunctions.push((d) => {
          universe[index] = mapDegrees(d, channel.minDegrees, channel.maxDegrees);
        });
        break;
      case 'tilt-fine':
        tiltFunctions.push((d) => {
          const m = mapDegrees(d, channel.minDegrees, channel.maxDegrees);
          universe[index] =
            (m * 255) % 255;
        });
      case 'zoom':
        zoomFunctions.push((z) => {
          universe[index] = (z * 255) % 256;
        });
      default:
        continue;
    }
  }

  return {
    setChannel: (index, value) => {
      universe[index + physicalFixture.channelOffset - 1] = value;
    },

    setRGB: (r, g, b) => {
      rgbFunctions.forEach(f => f(r, g, b));
    },

    setRGBW: (r, g, b, w) => {
      rgbFunctions.forEach(f => f(r, g, b));
      whiteFunctions.forEach(f => f(w));
    },

    setBrightness: (brightness: number) => {
      brightnessFunctions.forEach(f => f(brightness));
    },

    setStrobe: (speed) => {
      strobeFunctions.forEach(f => f(speed));
    },

    setPan: (degrees: number) => {
      panFunctions.forEach(f => f(degrees));
    },

    setTilt: (degrees: number) => {
      tiltFunctions.forEach(f => f(degrees));
    },

    setZoom: (amount: number) => {
      zoomFunctions.forEach(f => f(amount));
    },

    channelTypes,
  };
}

function mapDegrees(value: number, minDegrees: number, maxDegrees: number): number {
  return Math.max(
    Math.min(
      255 * (value - minDegrees) / (maxDegrees - minDegrees),
      255),
    0);
}

export function getPhysicalWritableDeviceFromGroup(
  project: Project,
  groupId: bigint,
  universe: DmxUniverse): WritableDevice | undefined {
  const group = project.groups[groupId.toString()];
  if (!group) {
    return undefined;
  }

  const writableDevices = getAllFixtures(project, groupId)
    .map((id) => {
      const mapping = new OutputId_FixtureMapping();
      mapping.fixtures[project.activeUniverse.toString()] = id;
      return getPhysicalWritableDevice(project, mapping, universe);
    });

  const channelTypes: ChannelTypes[] = [];
  writableDevices.forEach(d => d.channelTypes
    .forEach((c, i) => channelTypes[i] = c));

  return {
    setChannel: (index: number, value: number) =>
      writableDevices.forEach(d => d.setChannel(index, value)),
    setRGB: (red: number, green: number, blue: number) =>
      writableDevices.forEach(d => d.setRGB(red, green, blue)),
    setRGBW: (red: number, green: number, blue: number, white: number) =>
      writableDevices.forEach(d => d.setRGBW(red, green, blue, white)),
    setBrightness: (brightness: number) =>
      writableDevices.forEach(d => d.setBrightness(brightness)),
    setStrobe: (speed) =>
      writableDevices.forEach(d => d.setStrobe(speed)),
    setPan: (degrees: number) =>
      writableDevices.forEach(d => d.setPan(degrees)),
    setTilt: (degrees: number) =>
      writableDevices.forEach(d => d.setTilt(degrees)),
    setZoom: (amount: number) =>
      writableDevices.forEach(d => d.setZoom(amount)),
    channelTypes,
  };
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
      if (description.case === 'effect') {
        if (description.value.outputId.output.case === 'fixtures') {
          const fixtures = description.value.outputId.output.value.fixtures;
          delete fixtures[project.activeUniverse.toString()];
        }
      } else if (description.case === 'sequence') {
        description.value.lightTracks.forEach(deleteFromLightTrack);
      }
    });

  delete getActiveUniverse(project).fixtures[fixtureId.toString()];
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
      if (description.case === 'effect') {
        if (description.value.outputId.output.case === 'group' && description.value.outputId.output.value === fixtureGroupId) {
          delete description.value.outputId;
        }
      } else if (description.case === 'sequence') {
        description.value.lightTracks.forEach(deleteFromLightTrack);
      }
    });

  delete project.groups[fixtureGroupId.toString()];
}
