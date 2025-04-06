import { create, toJsonString } from '@bufbuild/protobuf';
import { BeatMetadataSchema } from '@dmx-controller/proto/beat_pb';
import {
  JSX,
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createRealTimeBpmProcessor } from 'realtime-bpm-analyzer';

import { ProjectContext } from './ProjectContext';

const MAX_SAMPLES = 16;
const DEVIATION_THRESHOLD = 75;

type BeatDetectionStrategy = 'manual' | 'microphone';
type SampleQuality =
  | 'idle'
  | 'not enough samples'
  | 'poor'
  | 'fair'
  | 'excellent';

export const BeatContext = createContext({
  beat: create(BeatMetadataSchema, {
    lengthMs: Number.MAX_SAFE_INTEGER,
    offsetMs: BigInt(0),
  }),
  setBeat: (_duration: number, _start?: bigint) => {},
  addBeatSample: (_t: number) => {},
  sampleQuality: 'idle' as SampleQuality,
  detectionStrategy: 'manual' as BeatDetectionStrategy,
  setDetectionStrategy: (_strategy: BeatDetectionStrategy) => {},
});

export function BeatProvider({ children }: PropsWithChildren): JSX.Element {
  const { project, save, update } = useContext(ProjectContext);
  const [strategy, setStrategy] = useState<BeatDetectionStrategy>('manual');
  const [beatSamples, setBeatSamples] = useState<number[]>([]);
  const [beatTimeout, setBeatTimeout] = useState<any>(null);

  useEffect(() => {
    if (strategy === 'microphone') {
      const audioContext = new AudioContext();
      let media: MediaStream;
      (async () => {
        media = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true,
        });
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(media);

        const realtimeAnalyzerNode = await createRealTimeBpmProcessor(
          audioContext,
          {
            continuousAnalysis: true,
            stabilizationTime: 16_000,
          },
        );

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

  const beat = useMemo(
    () =>
      project?.liveBeat ||
      create(BeatMetadataSchema, {
        lengthMs: Number.MAX_SAFE_INTEGER,
        offsetMs: BigInt(0),
      }),
    [project],
  );

  const addBeatSample = useCallback(
    (t: number) => {
      setBeatSamples((beatSamples) => {
        const newSamples = [t, ...beatSamples];
        return newSamples.slice(0, MAX_SAMPLES);
      });

      const handle = setTimeout(() => {
        save(
          `Set beat to ${Math.round(60_000 / (project.liveBeat?.lengthMs || 1))} BPM.`,
        );
        setBeatSamples([]);
      }, 2_000);
      clearTimeout(beatTimeout);
      setBeatTimeout(handle);
    },
    [beatSamples, beatTimeout],
  );

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
    const count = Math.min(durations.length, MAX_SAMPLES);
    let divisor = 0;
    let sum = 0;
    for (let i = 0; i < count; ++i) {
      const strength = (count - i) / count;
      sum += durations[i] * strength;
      divisor += strength;
    }

    let length = sum / divisor;
    const bpm = 60_000 / length;

    // Try to snap to whole nearest BPM.
    if (sampleQuality === 'excellent') {
      const nearestWholeBpm = Math.round(bpm);
      if (Math.abs(nearestWholeBpm - bpm) < 0.1) {
        length = 60_000 / nearestWholeBpm;
      }
    }

    const firstBeat =
      beatSamples[beatSamples.length - 1] - beatSamples.length * length;
    const offset = BigInt(Math.round(firstBeat));
    if (sampleQuality === 'fair' || sampleQuality === 'excellent') {
      project.liveBeat = create(BeatMetadataSchema, {
        lengthMs: length,
        offsetMs: offset,
      });
      update();
    } else {
      if (project.liveBeat == null) {
        throw new Error('Project does not have live beat!');
      }
      project.liveBeat.offsetMs = offset;
      update();
    }
  }, [beatSamples, toJsonString(BeatMetadataSchema, project?.liveBeat!)]);

  return (
    <BeatContext.Provider
      value={{
        beat,
        setBeat: (length, start) => {
          project.liveBeat = create(BeatMetadataSchema, {
            lengthMs: length,
            offsetMs: start || project.liveBeat?.offsetMs || 0n,
          });
          save('Manually set beat');
        },
        addBeatSample,
        sampleQuality,
        detectionStrategy: strategy,
        setDetectionStrategy: setStrategy,
      }}
    >
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
    durations.push(beatSamples[i - 1] - beatSamples[i]);
  }
  return durations;
}
