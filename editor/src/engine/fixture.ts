
type DmxUniverse = Uint8Array;

type ColorChannelType =
  'blue' |
  'blue-fine' |
  'brightness' |
  'brightness-fine' |
  'green' |
  'green-fine' |
  'red' |
  'red-fine' |
  'white' |
  'white-fine';

type RotationChannelType =
  'pan' |
  'pan-fine' |
  'tilt' |
  'tilt-fine';

type ChannelDefinition =
  ColorChannelDefinition |
  RotationChannelDefinition;

interface ColorChannelDefinition {
  type: ColorChannelType;
}

interface RotationChannelDefinition {
  type: RotationChannelType;
  minDeg: number;
  maxDeg: number;
}

export interface FixtureDefinition {
  name: string;
  manufacturer?: string;
  channels: { [channel: number]: ChannelDefinition };
}

export interface PhysicalFixture {
  name: string;
  definition: FixtureDefinition;
  channelOffset: number;
}

interface WritableDevice {
  /**
   * Manually overrides a channel. Valid numbers are [0, 255].
   */
  setChannel(index: number, value: number);

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
}

export function getPhysicalWritableDevice(
  device: PhysicalFixture,
  universe: DmxUniverse): WritableDevice {
  const definition = device.definition;

  const rgbFunctions: Array<(r: number, g: number, b: number) => void> = [];
  const whiteFunctions: Array<(w: number) => void> = [];
  const brightnessFunctions: Array<(b: number) => void> = [];
  const panFunctions: Array<(d: number) => void> = [];
  const tiltFunctions: Array<(d: number) => void> = [];

  for (const stringIndex in definition.channels) {
    const channel = definition.channels[stringIndex];
    const index = device.channelOffset + parseInt(stringIndex) - 1;
    switch (channel.type) {
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
          universe[index] = mapDegrees(d, channel.minDeg, channel.maxDeg);
        });
        break;
      case 'pan-fine':
        panFunctions.push((d) => {
          universe[index] =
            (mapDegrees(d, channel.minDeg, channel.maxDeg) * 255) % 255;
        });
        break;
      case 'tilt':
        tiltFunctions.push((d) => {
          universe[index] = mapDegrees(d, channel.minDeg, channel.maxDeg);
        });
        break;
      case 'tilt-fine':
        tiltFunctions.push((d) => {
          universe[index] =
            (mapDegrees(d, channel.minDeg, channel.maxDeg) * 255) % 255;
        });
      default:
        return;
    }
  }

  return {
    setChannel: (index, value) => {
      universe[index + device.channelOffset - 1] = value;
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
  };
}

function mapDegrees(value, minDeg, maxDeg): number {
  return Math.max(
    Math.min(
      255 * (value - minDeg) / (maxDeg - minDeg),
      255),
    0);
}
