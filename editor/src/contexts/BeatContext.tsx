import { PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BeatMetadata } from '@dmx-controller/proto/beat_pb';
import { ProjectContext } from './ProjectContext';
import { createRealTimeBpmProcessor } from 'realtime-bpm-analyzer';

const DEVIATION_THRESHOLD = 75;

type BeatDetectionStrategy = 'manual' | 'microphone';
type SampleQuality = 'idle' | 'not enough samples' | 'poor' | 'fair' | 'excellent';

export const BeatContext = createContext({
  beat: new BeatMetadata({ lengthMs: Number.MAX_SAFE_INTEGER, offsetMs: BigInt(0) }),
  setBeat: (_duration: number, _start?: bigint) => { },
  addBeatSample: (_t: number) => { },
  sampleQuality: 'idle' as SampleQuality,
  detectionStrategy: 'manual' as BeatDetectionStrategy,
  setDetectionStrategy: (_strategy: BeatDetectionStrategy) => { },
});

export function BeatProvider({ children }: PropsWithChildren): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const [strategy, setStrategy] = useState<BeatDetectionStrategy>('manual');
  const [beatSamples, setBeatSamples] = useState<number[]>([]);
  const [beatTimeout, setBeatTimeout] = useState<any>(null);

  useEffect(() => {
    if (strategy === 'microphone') {
      const audioContext = new AudioContext();
      let media: MediaStream;
      (async () => {
        media = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(media);

        const realtimeAnalyzerNode = await createRealTimeBpmProcessor(audioContext, {
          continuousAnalysis: true,
          stabilizationTime: 16_000,
        });

        // We're not doing a lowpass here, it doesn't seem to help much.
        source.connect(realtimeAnalyzerNode);

        realtimeAnalyzerNode.port.onmessage = (event) => {
          if (event.data.message === 'BPM_STABLE') {
            const bpm = event.data.data.bpm[0].tempo;
            console.log('Found stable bpm', bpm);
            if (project.liveBeat == null) {
              throw new Error('Project does not have live beat!');
            }
            project.liveBeat.lengthMs = 60_000 / bpm;
            save(`Auto set BPM to ${bpm}.`, false);
          }
        };
      })();
      return () => {
        audioContext.close();
        if (media != null) {
          media.getAudioTracks()[0].stop();
        }
      };
    }
    return undefined;
  }, [strategy]);

  const beat = useMemo(() => project?.liveBeat || new BeatMetadata({ lengthMs: Number.MAX_SAFE_INTEGER, offsetMs: BigInt(0) }), [project]);

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
    if (beatSamples.length < 2) {
      return;
    }

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
    const offset = BigInt(Math.round(firstBeat));
    if (sampleQuality === 'fair' || sampleQuality === 'excellent') {
      project.liveBeat = new BeatMetadata({
        lengthMs: length,
        offsetMs: offset,
      });
      save(`Set beat to ${Math.round(bpm)} BPM.`);
    } else {
      if (project.liveBeat == null) {
        throw new Error('Project does not have live beat!');
      }
      project.liveBeat.offsetMs = offset;
      save(`Set beat offset to ${offset}.`);
    }
  }, [beatSamples, project?.liveBeat?.toJsonString()]);

  return (
    <BeatContext.Provider value={{
      beat,
      setBeat: (length, start) => {
      project.liveBeat = new BeatMetadata({
        lengthMs: length,
        offsetMs: start || project.liveBeat?.offsetMs || 0n,
      });
      save('Manually set beat');
      },
      addBeatSample,
      sampleQuality,
      detectionStrategy: strategy,
      setDetectionStrategy: setStrategy
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
