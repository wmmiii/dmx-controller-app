import { create } from '@bufbuild/protobuf';
import {
  ColorSchema,
  PaletteColor,
  type Color,
} from '@dmx-controller/proto/color_pb';
import { type FixtureState } from '@dmx-controller/proto/effect_pb';
import { RenderContext } from './context';

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
  const device = context.writableDeviceCache.get(context.target);
  if (state == null || device == null) {
    return;
  }

  switch (state.lightColor.case) {
    case 'color':
      {
        const color = state.lightColor.value;
        device.setColor(
          context.output,
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
        context.output,
        color.red,
        color.green,
        color.blue,
        color.white,
      );
    }
  }

  if (state.pan != null) {
    device.setAngle(context.output, 'pan', state.pan);
  }

  if (state.tilt != null) {
    device.setAngle(context.output, 'tilt', state.tilt);
  }

  if (state.dimmer != null) {
    device.setAmount(context.output, 'dimmer', state.dimmer);
  }

  if (state.strobe != null) {
    device.setAmount(context.output, 'strobe', state.strobe);
  }

  if (state.width != null) {
    device.setAmount(context.output, 'width', state.width);
  }

  if (state.height != null) {
    device.setAmount(context.output, 'height', state.height);
  }

  if (state.zoom != null) {
    device.setAmount(context.output, 'zoom', state.zoom);
  }

  if (state.speed != null) {
    device.setAmount(context.output, 'speed', state.speed);
  }

  for (const channel of state.channels) {
    device.setDmxChannel(context.output, channel.index, channel.value);
  }

  if (state.wledEffect != null) {
    device.setWledEffect(context.output, state.wledEffect);
  }

  if (state.wledPalette != null) {
    device?.setWledPalette(context.output, state.wledPalette);
  }
}
