import { Project } from "@dmx-controller/proto/project_pb";
import { getAllFixtures } from "./group";

export type DmxUniverse = Uint8Array;

export type ChannelTypes =
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
  'pan' |
  'pan-fine' |
  'tilt' |
  'tilt-fine';

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
   * Sets the pan based on a [0, 360] degree value.
   */
  setPan(degrees: number): void;

  /**
   * Sets the tilt based on a [0, 360] degree value.
   */
  setTilt(degrees: number): void;

  /**
   * Returns the type of all the channels according to this device.
   */
  readonly channelTypes: ChannelTypes[];
}

export function getPhysicalWritableDevice(
  project: Project,
  physicalFixtureId: number,
  universe: DmxUniverse): WritableDevice | undefined {
  const physicalFixture = project.physicalFixtures[physicalFixtureId];
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
  const panFunctions: Array<(d: number) => void> = [];
  const tiltFunctions: Array<(d: number) => void> = [];

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
            (mapDegrees(d, channel.minDegrees, channel.maxDegrees) * 255) % 255;
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

    setPan: (degrees: number) => {
      panFunctions.forEach(f => f(degrees));
    },

    setTilt: (degrees: number) => {
      tiltFunctions.forEach(f => f(degrees));
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
  physicalFixtureGroupId: number,
  universe: DmxUniverse): WritableDevice | undefined {
  const group = project.physicalFixtureGroups[physicalFixtureGroupId];
  if (!group) {
    return undefined;
  }

  const writableDevices = getAllFixtures(project, physicalFixtureGroupId)
    .map((id) => getPhysicalWritableDevice(
      project, id, universe));

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
    setPan: (degrees: number) =>
      writableDevices.forEach(d => d.setPan(degrees)),
    setTilt: (degrees: number) =>
      writableDevices.forEach(d => d.setTilt(degrees)),
    channelTypes,
  };
}
