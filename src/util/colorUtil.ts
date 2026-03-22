import { create } from '@bufbuild/protobuf';
import {
  ColorPaletteSchema,
  ColorSchema,
  type Color,
  type ColorPalette,
} from '@dmx-controller/proto/color_pb';
import ColorConverter from 'cie-rgb-color-converter';

export const DEFAULT_COLOR_PALETTE = create(ColorPaletteSchema, {
  name: 'Unset palette',
  primary: {
    color: {
      red: 1,
      green: 0,
      blue: 1,
    },
  },
  secondary: {
    color: {
      red: 0,
      green: 1,
      blue: 1,
    },
  },
  tertiary: {
    color: {
      red: 1,
      green: 1,
      blue: 0,
    },
  },
}) as ColorPalette;

export function rgbwToHex(r: number, g: number, b: number, w: number) {
  r = Math.floor(Math.min((r + w) * 255, 255));
  g = Math.floor(Math.min((g + w) * 255, 255));
  b = Math.floor(Math.min((b + w) * 255, 255));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export function stringifyColor(color: Color) {
  return `rgb(${color.red * 255}, ${color.green * 255}, ${color.blue * 255})`;
}

export function cieToColor(x: number, y: number, bri: number) {
  const color = ColorConverter.xyBriToRgb(x, y, bri);
  return create(ColorSchema, {
    red: color.r / 255,
    green: color.g / 255,
    blue: color.b / 255,
  }) as Color;
}
