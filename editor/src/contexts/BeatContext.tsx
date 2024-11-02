import React, { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BeatMetadata } from '@dmx-controller/proto/beat_pb';
import { ProjectContext } from './ProjectContext';

const DEVIATION_THRESHOLD = 75;

type SampleQuality = 'idle' | 'not enough samples' | 'poor' | 'fair' | 'excellent';

export const BeatContext = createContext({
  beat: new BeatMetadata({ lengthMs: Number.MAX_SAFE_INTEGER, offsetMs: BigInt(0) }),
  addBeatSample: (_t: number) => { },
  sampleQuality: 'idle' as SampleQuality,
});

export function BeatProvider({ children }: PropsWithChildren): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const [beatSamples, setBeatSamples] = useState<number[]>([]);
  const [beatTimeout, setBeatTimeout] = useState<any>(null);

  const beat = useMemo(() => project?.liveBeat, [project]);

  const addBeatSample = useCallback((t: number) => {
    setBeatSamples([...beatSamples, t]);

    const handle = setTimeout(() => {
      setBeatSamples([]);
    }, 3_000);
    clearTimeout(beatTimeout);
    setBeatTimeout(handle);
  }, [beatSamples, beatTimeout]);

  const sampleQuality: SampleQuality = useMemo(() => {
    const deviance = maxDevianceMs(beatSamples);

    if (beatSamples.length === 0) {
      return 'idle';
    } else if (beatSamples.length < 4) {
      return 'not enough samples';
    } else if (deviance > DEVIATION_THRESHOLD * 2) {
      return 'poor';
    } else if (deviance > DEVIATION_THRESHOLD) {
      return 'fair';
    } else {
      return 'excellent';
    }
  }, [beatSamples]);


  useEffect(() => {
    if (sampleQuality === 'fair' || sampleQuality === 'excellent') {
      const durations = sampleDurations(beatSamples);
      let sum = 0;
      for (let d of sampleDurations(beatSamples)) {
        sum += d;
      }

      let length = sum / durations.length;
      const bpm = 60_000 / length;

      // Try to snap to whole nearest BPM.
      if (sampleQuality === 'excellent') {
        const nearestWholeBpm = Math.round(bpm);
        if (Math.abs(nearestWholeBpm - bpm) < 0.1) {
          length = 60_000 / nearestWholeBpm;
        }
      }

      const firstBeat = beatSamples[beatSamples.length - 1] -
        beatSamples.length * length;

      project.liveBeat = new BeatMetadata({
        lengthMs: length,
        offsetMs: BigInt(Math.round(firstBeat)),
      });
      save(`Set beat to ${Math.round(bpm)} BPM.`);
    }
  }, [beatSamples]);

  return (
    <BeatContext.Provider value={{
      beat,
      addBeatSample,
      sampleQuality,
    }}>
      {children}
    </BeatContext.Provider>
  );
}

function maxDevianceMs(beatSamples: number[]) {
  const durations = sampleDurations(beatSamples);
  return Math.max(...durations) - Math.min(...durations);
}

function sampleDurations(beatSamples: number[]) {
  const durations: number[] = [];
  for (let i = 1; i < beatSamples.length; i++) {
    durations.push(beatSamples[i] - beatSamples[i - 1]);
  }
  return durations;
}
