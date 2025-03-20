import { Color, ColorPalette } from "@dmx-controller/proto/color_pb";
import ColorConverter from 'cie-rgb-color-converter';

export function stringifyColor(color: Color) {
  return `rgb(${color.red * 255}, ${color.green * 255}, ${color.blue * 255})`;
}

export function interpolatePalettes(a: ColorPalette, b: ColorPalette, t: number) {
  if (a.primary?.color == null || a.secondary?.color == null || a.tertiary?.color == null) {
    throw new Error('Tried to interpolate palette but palette "a" does not have color set!');
  }
  if (b.primary?.color == null || b.secondary?.color == null || b.tertiary?.color == null) {
    throw new Error('Tried to interpolate palette but palette "b" does not have color set!');
  }
  return new ColorPalette({
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
    case 0: r = v, g = t, b = p; break;
    case 1: r = q, g = v, b = p; break;
    case 2: r = p, g = v, b = t; break;
    case 3: r = p, g = q, b = v; break;
    case 4: r = t, g = p, b = v; break;
    case 5: r = v, g = p, b = q; break;
  }
  return new Color({
    red: r,
    green: g,
    blue: b,
  });
}

export function cieToColor(x: number, y: number, bri: number) {
  const color = ColorConverter.xyBriToRgb(x, y, bri);
  return new Color({
    red: color.r / 255,
    green: color.g / 255,
    blue: color.b / 255,
  });
}
