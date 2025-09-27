import { FixtureState } from '@dmx-controller/proto/effect_pb';

interface ChannelDescription {
  description: string;
}

export const COLOR_CHANNEL_DESCRIPTIONS: {
  [channel: string]: ChannelDescription;
} = {
  red: {
    description: 'The red component of a light.',
  },
  green: {
    description: 'The green component of a light.',
  },
  blue: {
    description: 'The blue component of a light.',
  },
  cyan: {
    description: 'The cyan component of a light.',
  },
  magenta: {
    description: 'The magenta component of a light.',
  },
  yellow: {
    description: 'The yellow component of a light.',
  },
  white: {
    description: 'The white component of a light.',
  },
} as const;
export const COLOR_CHANNELS = Object.keys(COLOR_CHANNEL_DESCRIPTIONS);
export type ColorChannel = (typeof COLOR_CHANNELS)[number];
export function isColorChannel(type: string): type is ColorChannel {
  return COLOR_CHANNELS.includes(type as ColorChannel);
}

export const ANGLE_CHANNEL_DESCRIPTIONS: Map<
  keyof FixtureState,
  ChannelDescription
> = new Map();
ANGLE_CHANNEL_DESCRIPTIONS.set('pan', {
  description: 'The pan angle of a moving fixture.',
});
ANGLE_CHANNEL_DESCRIPTIONS.set('tilt', {
  description: 'The tilt angle of a moving fixture.',
});
export const ANGLE_CHANNELS = Array.from(
  ANGLE_CHANNEL_DESCRIPTIONS.keys(),
) as Array<keyof FixtureState>;
export type AngleChannel = (typeof ANGLE_CHANNELS)[number];
export function isAngleChannel(type: string): type is AngleChannel {
  return ANGLE_CHANNELS.includes(type as AngleChannel);
}
export const AMOUNT_CHANNEL_DESCRIPTION: Map<
  keyof FixtureState | 'speed',
  ChannelDescription
> = new Map();
AMOUNT_CHANNEL_DESCRIPTION.set('dimmer', {
  description: 'The dimmer of a light fixture',
});
AMOUNT_CHANNEL_DESCRIPTION.set('height', {
  description: 'The height of a fixture such as display height.',
});
AMOUNT_CHANNEL_DESCRIPTION.set('strobe', {
  description: 'The internal strobe of a fixture.',
});
AMOUNT_CHANNEL_DESCRIPTION.set('speed', {
  description: 'The speed of the WLED effect.',
});
AMOUNT_CHANNEL_DESCRIPTION.set('width', {
  description: 'The width of a fixture such as display width.',
});
AMOUNT_CHANNEL_DESCRIPTION.set('zoom', {
  description: 'How zoomed in or out a light fixture is.',
});
export const AMOUNT_CHANNELS = Array.from(
  AMOUNT_CHANNEL_DESCRIPTION.keys(),
) as Array<keyof FixtureState | 'speed'>;
export type AmountChannel = (typeof AMOUNT_CHANNELS)[number];
export function isAmountChannel(type: string): type is AmountChannel {
  return AMOUNT_CHANNELS.includes(type as AmountChannel);
}

export const WLED_CHANNELS = ['wledEffect', 'wledPalette'];
export type WledChannel = (typeof WLED_CHANNELS)[number];
export function isWledChannel(type: string): type is WledChannel {
  return WLED_CHANNELS.includes(type as WledChannel);
}

export const ALL_CHANNELS = [
  ...COLOR_CHANNELS,
  ...ANGLE_CHANNELS,
  ...AMOUNT_CHANNELS,
  ...WLED_CHANNELS,
];

export type ChannelTypes = ColorChannel | AngleChannel | AmountChannel;
