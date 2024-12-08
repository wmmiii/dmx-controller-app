import { Color, ColorPalette } from "@dmx-controller/proto/color_pb";

export function stringifyColor(color: Color) {
  return `rgb(${color.red * 255}, ${color.green * 255}, ${color.blue * 255})`;
}

export function interpolatePalettes(a: ColorPalette, b: ColorPalette, t: number) {
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
