import { createContext } from 'react';
import { TrackBeatConverters } from '../wasm/engine';

export const EffectRenderingContext = createContext({
  beatWidthPx: 100,
  msToPx: (ms: number) => ms,
  beatConverters: {
    msToBeat: (_ms) => 0,
    beatToMs: (_beat) => 0,
  } as TrackBeatConverters | null,
});
