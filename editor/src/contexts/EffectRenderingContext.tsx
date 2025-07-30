import { createContext } from 'react';

export const EffectRenderingContext = createContext({
  beatWidthPx: 100,
  msWidthToPxWidth: (ms: number) => ms,
});
