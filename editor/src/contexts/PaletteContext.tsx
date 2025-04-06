import { createContext } from 'react';
import { DEFAULT_COLOR_PALETTE } from '../engine/universe';

export const PaletteContext = createContext({
  palette: DEFAULT_COLOR_PALETTE,
});
