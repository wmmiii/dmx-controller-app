import { create } from '@bufbuild/protobuf';
import { BeatMetadataSchema } from '@dmx-controller/proto/beat_pb';
import {
  JSX,
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  addBeatSample,
  subscribeToBeatSamplingState,
} from '../system_interfaces/midi';
import { ProjectContext } from './ProjectContext';

export const BeatContext = createContext({
  setBeat: (_duration: number, _start?: bigint) => {},
  addBeatSample: () => {},
  sampling: false,
});

export function BeatProvider({ children }: PropsWithChildren): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const [sampling, setSampling] = useState(false);
  const samplingHandle = useRef<number | undefined>(undefined);

  // Listen for beat sampling state changes from the Rust backend
  useEffect(
    () =>
      subscribeToBeatSamplingState(() => {
        setSampling(true);
        clearTimeout(samplingHandle.current);
        samplingHandle.current = setTimeout(() => {
          setSampling(false);
        }, 3_000);
      }),
    [],
  );

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
        sampling,
      }}
    >
      {children}
    </BeatContext.Provider>
  );
}
