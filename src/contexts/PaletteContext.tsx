import { createContext } from 'react';
import { DEFAULT_COLOR_PALETTE } from '../util/colorUtil';

export const PaletteContext = createContext({
  palette: DEFAULT_COLOR_PALETTE,
});
