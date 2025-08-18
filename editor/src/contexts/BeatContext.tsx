import { create } from '@bufbuild/protobuf';
import { BeatMetadataSchema } from '@dmx-controller/proto/beat_pb';
import {
  JSX,
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { ProjectContext } from './ProjectContext';

const MAX_SAMPLES = 16;

export const BeatContext = createContext({
  setBeat: (_duration: number, _start?: bigint) => {},
  addBeatSample: (_t: number) => {},
  setFirstBeat: (_t: number) => {},
  sampling: false,
});

export function BeatProvider({ children }: PropsWithChildren): JSX.Element {
  const { project, save, update } = useContext(ProjectContext);
  const [beatSamples, setBeatSamples] = useState<number[]>([]);
  const [beatCount, setBeatCount] = useState(0);
  const beatTimeout = useRef<any>(null);
  const [sampling, setSampling] = useState(false);

  const calculateBeatDuration = useCallback(() => {
    if (beatSamples.length < 2) {
      return null;
    }

    const totalLength = beatSamples[beatSamples.length - 1] - beatSamples[0];
    let lengthMs = totalLength / (beatSamples.length - 1);
    const bpm = 60_000 / lengthMs;

    // Try to snap to whole nearest BPM.
    const nearestWholeBpm = Math.round(bpm);
    if (Math.abs(nearestWholeBpm - bpm) < 0.1) {
      lengthMs = 60_000 / nearestWholeBpm;
    }
    return lengthMs;
  }, [beatSamples]);

  const addBeatSample = useCallback(
    (t: number) => {
      setBeatSamples((beatSamples) => {
        const newSamples = [...beatSamples, t];
        return newSamples.slice(Math.max(newSamples.length - MAX_SAMPLES, 0));
      });
      setBeatCount((c) => c + 1);
      setSampling(true);

      // This should handle a BPM down to 30 BPM.
      const handle = setTimeout(
        () => {
          save(
            `Set beat to ${Math.round(60_000 / project.liveBeat!.lengthMs)} BPM.`,
          );
          setSampling(false);
          setBeatCount(0);
          setBeatSamples([]);
        },
        calculateBeatDuration() || 60_000 / 30,
      );
      clearTimeout(beatTimeout.current);
      beatTimeout.current = handle;
    },
    [setBeatSamples, setSampling, calculateBeatDuration],
  );

  const setFirstBeat = useCallback(
    (t: number) => {
      if (beatSamples.length === 0) {
        project.liveBeat!.offsetMs = BigInt(t);
        save('Manually set first beat.');
      } else {
        const lastSampled = beatSamples[beatSamples.length - 1];
        if (Math.abs(lastSampled - t) < project.liveBeat!.lengthMs / 2) {
          setBeatCount(0);
        } else {
          setBeatCount(1);
        }
      }
    },
    [setBeatCount, project, save],
  );

  useEffect(() => {
    const lengthMs = calculateBeatDuration();
    if (lengthMs == null) {
      return;
    }

    const firstBeat =
      beatSamples[beatSamples.length - 1] - (beatCount - 1) * lengthMs;
    const offset = BigInt(Math.round(firstBeat));
    project.liveBeat!.lengthMs = lengthMs;
    project.liveBeat!.offsetMs = offset;
    update();
  }, [calculateBeatDuration, beatSamples, beatCount]);

  return (
    <BeatContext.Provider
      value={{
        setBeat: (length, start) => {
          project.liveBeat = create(BeatMetadataSchema, {
            lengthMs: length,
            offsetMs: start || project.liveBeat?.offsetMs || 0n,
          });
          save('Manually set beat');
        },
        addBeatSample,
        setFirstBeat,
        sampling,
      }}
    >
      {children}
    </BeatContext.Provider>
  );
}
