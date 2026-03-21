import { Project } from '@dmx-controller/proto/project_pb';
import {
  JSX,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import {
  outputValues,
  performAction,
} from '../external_controller/externalController';

import { BeatContext } from './BeatContext';
import { ProjectContext } from './ProjectContext';

import { listen } from '@tauri-apps/api/event';
import {
  MidiPortCandidate,
  addMidiListener,
  connectMidi,
  disconnectMidi,
  listMidiInputs,
  removeMidiListener,
  sendControllerUpdate,
} from '../system_interfaces/midi';
import { isTauri } from '../system_interfaces/util';
import { randomUint64 } from '../util/numberUtils';
import { listenToTick } from '../util/time';
import styles from './ControllerContext.module.scss';

export type ControllerChannel = string;
export type ControlCommandType = 'msb' | 'lsb' | null;

export interface ConnectedDevice {
  name: string;
  bindingId: bigint;
}

type Listener = (
  _project: Project,
  _bindingId: bigint,
  _channel: ControllerChannel,
  _value: number,
  _controlType: ControlCommandType,
) => void;

export const ControllerContext = createContext({
  connectedDevices: [] as ConnectedDevice[],
  connect: () => {},
  disconnect: (_deviceName: string) => {},
  addListener: (_listener: Listener) => {},
  removeListener: (_listener: Listener) => {},
});

interface ControllerProviderImplProps {
  children: React.ReactNode;
}

export function ControllerProvider({
  children,
}: ControllerProviderImplProps): JSX.Element {
  const { project, lastLoad, save, update } = useContext(ProjectContext);
  const projectRef = useRef<Project>(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);
  const saveTimeout = useRef<any>(null);

  const { addBeatSample, setBeat, setFirstBeat } = useContext(BeatContext);

  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>(
    [],
  );
  const connectedDevicesRef = useRef<ConnectedDevice[]>([]);
  useEffect(() => {
    connectedDevicesRef.current = connectedDevices;
  }, [connectedDevices]);

  const [candidateList, setCandidateList] = useState<
    MidiPortCandidate[] | null
  >(null);
  const inputListeners = useRef<Array<Listener>>([]);

  const connect = useCallback(async () => {
    setCandidateList(await listMidiInputs());
  }, []);

  const disconnectDevice = useCallback(
    async (deviceName: string) => {
      await disconnectMidi({ id: '', name: deviceName });
      setConnectedDevices((prev) => prev.filter((d) => d.name !== deviceName));

      // Remove from lastControllerNames
      const mapping = project.controllerMapping;
      if (mapping) {
        const idx = mapping.lastControllerNames.indexOf(deviceName);
        if (idx >= 0) {
          mapping.lastControllerNames.splice(idx, 1);
        }
        save('Disconnect MIDI controller.');
      }
    },
    [project, save],
  );

  // Helper to get or create a bindingId for a controller name
  const getOrCreateBindingId = useCallback(
    (controllerMapping: NonNullable<Project['controllerMapping']>, name: string): bigint => {
      const existingBindingId = controllerMapping.controllerToBinding[name];
      if (existingBindingId !== undefined) {
        return existingBindingId;
      }
      const newBindingId = randomUint64();
      controllerMapping.controllerToBinding[name] = newBindingId;
      controllerMapping.bindingNames[newBindingId.toString()] = name;
      return newBindingId;
    },
    [],
  );

  // Auto-reconnect on load
  useEffect(() => {
    (async () => {
      const controllerMapping = project.controllerMapping;
      if (!controllerMapping) {
        return;
      }

      // Migration: if lastControllerNames is empty but controllerToBinding
      // has entries, populate from those keys
      if (
        controllerMapping.lastControllerNames.length === 0 &&
        Object.keys(controllerMapping.controllerToBinding).length > 0
      ) {
        controllerMapping.lastControllerNames = Object.keys(
          controllerMapping.controllerToBinding,
        );
      }

      if (controllerMapping.lastControllerNames.length === 0) {
        return;
      }

      const availableDevices = await listMidiInputs();
      const newConnected: ConnectedDevice[] = [];
      let needsSave = false;

      for (const name of controllerMapping.lastControllerNames) {
        const candidate = availableDevices.find((c) => c.name === name);
        if (candidate) {
          await connectMidi(candidate);
          const bindingId = getOrCreateBindingId(controllerMapping, name);
          if (
            controllerMapping.controllerToBinding[name] === undefined
          ) {
            needsSave = true;
          }
          newConnected.push({ name, bindingId });
        }
      }

      if (newConnected.length > 0) {
        setConnectedDevices(newConnected);
      }
      if (needsSave) {
        save('Created bindings for controllers.');
      }
    })();
  }, [lastLoad, save, getOrCreateBindingId]);

  // Listen for MIDI connection status changes from Tauri backend
  useEffect(() => {
    if (!isTauri) {
      return;
    }

    let unlisten = () => {};

    (async () => {
      unlisten = await listen(
        'midi-connection-status',
        (event: {
          payload: { controller_name: string; connected: boolean };
        }) => {
          const { controller_name: deviceName, connected } = event.payload;
          const controllerMapping = project.controllerMapping;

          if (controllerMapping) {
            if (connected) {
              const bindingId = controllerMapping.controllerToBinding[deviceName];
              if (bindingId !== undefined) {
                setConnectedDevices((prev) => {
                  if (prev.some((d) => d.name === deviceName)) {
                    return prev;
                  }
                  return [...prev, { name: deviceName, bindingId }];
                });
              }
            } else {
              setConnectedDevices((prev) =>
                prev.filter((d) => d.name !== deviceName),
              );
            }
          }
        },
      );
    })();

    return unlisten;
  }, [project]);

  // Raw MIDI message processing with per-device MSB/LSB buffers
  useEffect(() => {
    const msbBuffers = new Map<string, Map<number, number>>();
    const lsbBuffers = new Map<string, Map<number, number>>();

    const listener = (deviceName: string, data: number[]) => {
      // Resolve bindingId for this device
      const device = connectedDevicesRef.current.find(
        (d) => d.name === deviceName,
      );
      if (!device) {
        return;
      }

      // Get or create per-device buffers
      if (!msbBuffers.has(deviceName)) {
        msbBuffers.set(deviceName, new Map());
      }
      if (!lsbBuffers.has(deviceName)) {
        lsbBuffers.set(deviceName, new Map());
      }
      const msbBuffer = msbBuffers.get(deviceName)!;
      const lsbBuffer = lsbBuffers.get(deviceName)!;

      const command = data[0];

      let value = data[2];
      let controlCommandType: ControlCommandType = null;

      // https://computermusicresource.com/MIDI.Commands.html
      // https://www.songstuff.com/recording/article/midi-message-format/
      if (command > 127 && command < 144) {
        // Note off.
        value /= 127;
      } else if (command > 143 && command < 160) {
        // Note on.
        value /= 127;
      } else if (command > 159 && command < 176) {
        // Pressure.
        value /= 127;
      } else if (command > 175 && command < 192) {
        // Control value.
        // https://nickfever.com/music/midi-cc-list
        if (data[1] < 32) {
          msbBuffer.set(data[1], data[2]);
          value = data[2] + (lsbBuffer.get(data[1] + 32) || 0) / 127;
          controlCommandType = 'msb';
        } else if (data[1] > 31 && data[1] < 64) {
          lsbBuffer.set(data[1], data[2]);
          value = (msbBuffer.get(data[1] - 32) || 0) + data[2] / 127;
          controlCommandType = 'lsb';
        }
        value /= 127;
      } else {
        console.error('Unrecognized MIDI command!', command);
        return;
      }

      inputListeners.current.forEach((l) =>
        l(
          projectRef.current,
          device.bindingId,
          `${command}, ${data[1]}`,
          value,
          controlCommandType,
        ),
      );
    };

    addMidiListener(listener);

    return () => removeMidiListener(listener);
  }, [inputListeners, projectRef, connectedDevicesRef]);

  // MIDI output feedback for all connected devices
  useEffect(() => {
    if (connectedDevices.length === 0) {
      return;
    }

    return listenToTick((t) => {
      for (const device of connectedDevices) {
        sendControllerUpdate(device.name, () =>
          outputValues(project, device.bindingId, t),
        );
      }
    });
  }, [project, connectedDevices]);

  const addListener = useCallback((listener: Listener) => {
    inputListeners.current.push(listener);
  }, []);
  const removeListener = useCallback((listener: Listener) => {
    const index = inputListeners.current.indexOf(listener);
    if (index >= 0) {
      inputListeners.current.splice(index, 1);
    }
  }, []);

  // performAction effect — receives bindingId from listener
  useEffect(() => {
    const listener: Listener = (_p, bindingId, channel, value, cct) => {
      const modified = performAction(
        project,
        bindingId,
        channel,
        value,
        cct,
        addBeatSample,
        setFirstBeat,
        setBeat,
      );
      if (modified) {
        update();
        // Debounce midi input.
        clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(() => {
          save('Update via controller input.');
        }, 500);
      }
    };
    addListener(listener);
    return () => removeListener(listener);
  }, [
    project,
    saveTimeout,
    addBeatSample,
    update,
    setBeat,
    setFirstBeat,
    save,
    addListener,
    removeListener,
  ]);

  return (
    <>
      <ControllerContext.Provider
        value={{
          connectedDevices,
          connect,
          disconnect: disconnectDevice,
          addListener,
          removeListener,
        }}
      >
        {children}
      </ControllerContext.Provider>
      {candidateList && (
        <ControllerSelectionDialog
          candidateList={candidateList}
          connectedDevices={connectedDevices}
          setCandidate={async (candidate) => {
            if (candidate) {
              const name = candidate.name;
              const controllerMapping = project.controllerMapping!;

              // Add to lastControllerNames if not already present
              if (!controllerMapping.lastControllerNames.includes(name)) {
                controllerMapping.lastControllerNames.push(name);
              }

              // Get or create binding ID
              const bindingId = getOrCreateBindingId(controllerMapping, name);

              save('Connect MIDI controller.');
              await connectMidi(candidate);

              setConnectedDevices((prev) => {
                if (prev.some((d) => d.name === name)) {
                  return prev;
                }
                return [...prev, { name, bindingId }];
              });
            }
            setCandidateList(null);
          }}
        />
      )}
    </>
  );
}

interface ControllerSelectionDialogProps {
  candidateList: MidiPortCandidate[];
  connectedDevices: ConnectedDevice[];
  setCandidate: (portCandidate: MidiPortCandidate | null) => void;
}

function ControllerSelectionDialog({
  candidateList,
  connectedDevices,
  setCandidate,
}: ControllerSelectionDialogProps) {
  return (
    <Modal
      title="Select Midi device"
      bodyClass={styles.deviceSelect}
      onClose={() => setCandidate(null)}
    >
      <div>
        Select a MIDI device to connect. You can connect multiple devices
        simultaneously.
      </div>
      <div>
        Once a device is selected you may map MIDI inputs to actions. Simply:
        <ol>
          <li>Click on the MIDI button associated with the action.</li>
          <li>Move the input on your MIDI device.</li>
          <li>Your input is now bound! 🎉</li>
        </ol>
        To remove a mapping, just click on the MIDI button associated with the
        action again to unmap.
      </div>
      {candidateList.map((c, i) => {
        const isConnected = connectedDevices.some((d) => d.name === c.name);
        return (
          <Button
            key={i}
            onClick={() => setCandidate(c)}
            disabled={isConnected}
          >
            {c.name}
            {isConnected ? ' (connected)' : ''}
          </Button>
        );
      })}
    </Modal>
  );
}
