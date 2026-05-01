import {
  JSX,
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import {
  AudioAnalysis,
  AudioInputDevice,
  addAudioAnalysisListener,
  addDeviceListChangedListener,
  listAudioInputs,
  removeDeviceListChangedListener,
} from '../system_interfaces/audio_input';
import { ProjectContext } from './ProjectContext';

interface AudioInputContextType {
  availableDevices: AudioInputDevice[];
  selectedDevice: string | null;
  analysis: AudioAnalysis;
  select: (deviceName: string) => void;
  deselect: () => void;
}

const DEFAULT_ANALYSIS: AudioAnalysis = {
  bands: new Array(16).fill(0),
  all: 0,
};

export const AudioInputContext = createContext<AudioInputContextType>({
  availableDevices: [],
  selectedDevice: null,
  analysis: DEFAULT_ANALYSIS,
  select: () => {},
  deselect: () => {},
});

export function AudioInputProvider({
  children,
}: PropsWithChildren): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const [availableDevices, setAvailableDevices] = useState<AudioInputDevice[]>(
    [],
  );
  const [analysis, setAnalysis] = useState<AudioAnalysis>(DEFAULT_ANALYSIS);

  const selectedDevice = project.selectedAudioInput || null;

  // Fetch initial device list on mount
  useEffect(() => {
    listAudioInputs().then(setAvailableDevices).catch(console.error);
  }, []);

  // Listen for device list changes
  useEffect(() => {
    addDeviceListChangedListener(setAvailableDevices);
    return () => removeDeviceListChangedListener(setAvailableDevices);
  }, []);

  // Listen for audio analysis updates
  useEffect(() => {
    return addAudioAnalysisListener(setAnalysis);
  }, []);

  const select = useCallback(
    (deviceName: string) => {
      project.selectedAudioInput = deviceName;
      save('Select audio input device.');
    },
    [project, save],
  );

  const deselect = useCallback(() => {
    project.selectedAudioInput = '';
    save('Deselect audio input device.');
  }, [project, save]);

  return (
    <AudioInputContext.Provider
      value={{ availableDevices, selectedDevice, analysis, select, deselect }}
    >
      {children}
    </AudioInputContext.Provider>
  );
}
