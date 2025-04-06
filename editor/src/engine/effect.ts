import { create } from '@bufbuild/protobuf';
import {
  Color,
  ColorSchema,
  PaletteColor,
} from '@dmx-controller/proto/color_pb';
import { FixtureState } from '@dmx-controller/proto/effect_pb';

import { RenderContext } from './universe';

const COLOR_BLACK = create(ColorSchema, {
  red: 0,
  green: 0,
  blue: 0,
  white: 0,
});
const COLOR_WHITE = create(ColorSchema, {
  red: 0,
  green: 0,
  blue: 0,
  white: 1,
});

export function applyState(state: FixtureState, context: RenderContext): void {
  const device = context.output;
  if (state == null || device == null) {
    return;
  }

  const universe = context.universe;
  switch (state.lightColor.case) {
    case 'color':
      {
        const color = state.lightColor.value;
        device.setColor(
          universe,
          color.red,
          color.green,
          color.blue,
          color.white,
        );
      }
      break;
    case 'paletteColor': {
      let color: Color;
      switch (state.lightColor.value) {
        case PaletteColor.PALETTE_BLACK:
          color = COLOR_BLACK;
          break;
        case PaletteColor.PALETTE_WHITE:
          color = COLOR_WHITE;
          break;
        case PaletteColor.PALETTE_PRIMARY:
          if (context.colorPalette.primary?.color == null) {
            throw new Error(
              'Tried to fetch primary color from undefined palette!',
            );
          }
          color = context.colorPalette.primary.color;
          break;
        case PaletteColor.PALETTE_SECONDARY:
          if (context.colorPalette.secondary?.color == null) {
            throw new Error(
              'Tried to fetch secondary color from undefined palette!',
            );
          }
          color = context.colorPalette.secondary.color;
          break;
        case PaletteColor.PALETTE_TERTIARY:
          if (context.colorPalette.tertiary?.color == null) {
            throw new Error(
              'Tried to fetch tertiary color from undefined palette!',
            );
          }
          color = context.colorPalette.tertiary.color;
          break;
        default:
          throw new Error(
            `Unrecognized palette color type! ${state.lightColor}`,
          );
      }
      device.setColor(
        universe,
        color.red,
        color.green,
        color.blue,
        color.white,
      );
    }
  }

  if (state.pan != null) {
    device.setAngle(universe, 'pan', state.pan);
  }

  if (state.tilt != null) {
    device.setAngle(universe, 'tilt', state.tilt);
  }

  if (state.dimmer != null) {
    device.setAmount(universe, 'dimmer', state.dimmer);
  }

  if (state.strobe != null) {
    device.setAmount(universe, 'strobe', state.strobe);
  }

  if (state.width != null) {
    device.setAmount(universe, 'width', state.width);
  }

  if (state.height != null) {
    device.setAmount(universe, 'height', state.height);
  }

  if (state.zoom != null) {
    device.setAmount(universe, 'zoom', state.zoom);
  }

  for (const channel of state.channels) {
    device.setChannel(universe, channel.index, channel.value);
  }
}
