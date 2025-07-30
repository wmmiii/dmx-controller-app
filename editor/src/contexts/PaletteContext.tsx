import { createContext } from 'react';

import { DEFAULT_COLOR_PALETTE } from '../engine/render';

export const PaletteContext = createContext({
  palette: DEFAULT_COLOR_PALETTE,
});
