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

export function interpolatePalettes(
  a: ColorPalette,
  b: ColorPalette,
  t: number,
) {
  if (
    a.primary?.color == null ||
    a.secondary?.color == null ||
    a.tertiary?.color == null
  ) {
    throw new Error(
      'Tried to interpolate palette but palette "a" does not have color set!',
    );
  }
  if (
    b.primary?.color == null ||
    b.secondary?.color == null ||
    b.tertiary?.color == null
  ) {
    throw new Error(
      'Tried to interpolate palette but palette "b" does not have color set!',
    );
  }
  return create(ColorPaletteSchema, {
    primary: {
      color: {
        red: (1 - t) * a.primary.color.red + t * b.primary.color.red,
        green: (1 - t) * a.primary.color.green + t * b.primary.color.green,
        blue: (1 - t) * a.primary.color.blue + t * b.primary.color.blue,
      },
    },
    secondary: {
      color: {
        red: (1 - t) * a.secondary.color.red + t * b.secondary.color.red,
        green: (1 - t) * a.secondary.color.green + t * b.secondary.color.green,
        blue: (1 - t) * a.secondary.color.blue + t * b.secondary.color.blue,
      },
    },
    tertiary: {
      color: {
        red: (1 - t) * a.tertiary.color.red + t * b.tertiary.color.red,
        green: (1 - t) * a.tertiary.color.green + t * b.tertiary.color.green,
        blue: (1 - t) * a.tertiary.color.blue + t * b.tertiary.color.blue,
      },
    },
  });
}

export function hsvToColor(h: number, s: number, v: number) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0;
  let g = 0;
  let b = 0;
  switch (i % 6) {
    case 0:
      (r = v), (g = t), (b = p);
      break;
    case 1:
      (r = q), (g = v), (b = p);
      break;
    case 2:
      (r = p), (g = v), (b = t);
      break;
    case 3:
      (r = p), (g = q), (b = v);
      break;
    case 4:
      (r = t), (g = p), (b = v);
      break;
    case 5:
      (r = v), (g = p), (b = q);
      break;
  }
  return create(ColorSchema, {
    red: r,
    green: g,
    blue: b,
  });
}

export function cieToColor(x: number, y: number, bri: number) {
  const color = ColorConverter.xyBriToRgb(x, y, bri);
  return create(ColorSchema, {
    red: color.r / 255,
    green: color.g / 255,
    blue: color.b / 255,
  }) as Color;
}
