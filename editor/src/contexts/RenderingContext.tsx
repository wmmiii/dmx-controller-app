import { createContext } from 'react';

export const RenderingContext = createContext({
  beatWidthPx: 100,
  msWidthToPxWidth: (ms: number) => ms,
});
