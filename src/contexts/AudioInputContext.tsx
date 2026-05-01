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
  AudioInputDevice,
  addDeviceListChangedListener,
  listAudioInputs,
  removeDeviceListChangedListener,
} from '../system_interfaces/audio_input';
import { ProjectContext } from './ProjectContext';

interface AudioInputContextType {
  availableDevices: AudioInputDevice[];
  selectedDevice: string | null;
  select: (deviceName: string) => void;
  deselect: () => void;
}

export const AudioInputContext = createContext<AudioInputContextType>({
  availableDevices: [],
  selectedDevice: null,
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
      value={{ availableDevices, selectedDevice, select, deselect }}
    >
      {children}
    </AudioInputContext.Provider>
  );
}
