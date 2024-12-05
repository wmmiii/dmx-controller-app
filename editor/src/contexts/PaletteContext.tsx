import { Color, PaletteColor } from "@dmx-controller/proto/color_pb";
import { createContext } from "react";

const PaletteContext = createContext({
  palette: new Map<PaletteColor, Color>(),
});

