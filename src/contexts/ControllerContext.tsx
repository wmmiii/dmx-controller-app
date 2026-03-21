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
type Listener = (
  _project: Project,
  _channel: ControllerChannel,
  _value: number,
  _controlType: ControlCommandType,
) => void;

export const ControllerContext = createContext({
  controllerName: null as string | null,
  bindingId: null as bigint | null,
  connect: () => {},
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

  const [controllerName, setControllerName] = useState<string | undefined>(
    undefined,
  );
  const [bindingId, setBindingId] = useState<bigint | undefined>(undefined);
  const [candidateList, setCandidateList] = useState<
    MidiPortCandidate[] | null
  >(null);
  const inputListeners = useRef<Array<Listener>>([]);

  const connect = useCallback(async () => {
    setCandidateList(await listMidiInputs());
  }, []);

  useEffect(() => {
    (async () => {
      const controllerMapping = project.controllerMapping;
      // Try to reconnect if last controller is known.
      if (controllerMapping?.lastControllerName) {
        const candidate = (await listMidiInputs()).find(
          (candidate) =>
            candidate.name === controllerMapping.lastControllerName,
        );
        if (candidate) {
          await connectMidi(candidate);
          setControllerName(candidate.name);

          // Get or create binding ID for this controller
          const existingBindingId =
            controllerMapping.controllerToBinding[candidate.name];
          if (existingBindingId !== undefined) {
            setBindingId(existingBindingId);
          } else {
            const newBindingId = randomUint64();
            controllerMapping.controllerToBinding[candidate.name] =
              newBindingId;
            controllerMapping.bindingNames[newBindingId.toString()] =
              candidate.name;
            setBindingId(newBindingId);
            save('Created binding for controller.');
          }
        }
      }
    })();
  }, [lastLoad, setControllerName, setBindingId, save]);

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
          const { controller_name: controllerName, connected } = event.payload;
          const controllerMapping = project.controllerMapping;

          if (controllerMapping) {
            if (connected) {
              // Update frontend state to reflect the connection
              setControllerName(controllerName);
              setBindingId(
                controllerMapping.controllerToBinding[controllerName],
              );
            } else {
              // Clear frontend state when controller disconnects
              setControllerName(undefined);
              setBindingId(undefined);
            }
          }
        },
      );
    })();

    return unlisten;
  }, [project, setControllerName, setBindingId]);

  useEffect(() => {
    let msbBuffer: Map<number, number> = new Map();
    let lsbBuffer: Map<number, number> = new Map();
    const listener = (data: number[]) => {
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
          `${command}, ${data[1]}`,
          value,
          controlCommandType,
        ),
      );
    };

    addMidiListener(listener);

    return () => removeMidiListener(listener);
  }, [inputListeners, projectRef]);

  useEffect(() => {
    if (!bindingId) {
      return;
    }

    return listenToTick((t) =>
      sendControllerUpdate(() => outputValues(project, bindingId, t)),
    );
  }, [project, bindingId]);

  const addListener = useCallback((listener: Listener) => {
    inputListeners.current.push(listener);
  }, []);
  const removeListener = useCallback((listener: Listener) => {
    const index = inputListeners.current.indexOf(listener);
    if (index >= 0) {
      inputListeners.current.splice(index, 1);
    }
  }, []);

  useEffect(() => {
    const listener: Listener = (_p, channel, value, cct) => {
      if (bindingId) {
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
      }
    };
    addListener(listener);
    return () => removeListener(listener);
  }, [
    project,
    bindingId,
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
          controllerName: controllerName ?? null,
          bindingId: bindingId ?? null,
          connect: connect,
          addListener: addListener,
          removeListener: removeListener,
        }}
      >
        {children}
      </ControllerContext.Provider>
      {candidateList && (
        <ControllerSelectionDialog
          candidateList={candidateList}
          setCandidate={async (candidate) => {
            const name = candidate?.name || '';
            project.controllerMapping!.lastControllerName = name;
            if (candidate) {
              // Get or create binding ID for this controller
              const existingBindingId =
                project.controllerMapping!.controllerToBinding[name];
              let newBindingId: bigint;
              if (existingBindingId !== undefined) {
                newBindingId = existingBindingId;
              } else {
                newBindingId = randomUint64();
                project.controllerMapping!.controllerToBinding[name] =
                  newBindingId;
                project.controllerMapping!.bindingNames[
                  newBindingId.toString()
                ] = name;
              }
              setBindingId(newBindingId);
              save('Enable auto-reconnect for midi controller.');
              await connectMidi(candidate);
              setControllerName(name);
            } else {
              setBindingId(undefined);
              save('Disable auto-reconnect for midi controller.');
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
  setCandidate: (portCandidate: MidiPortCandidate | null) => void;
}

function ControllerSelectionDialog({
  candidateList,
  setCandidate,
}: ControllerSelectionDialogProps) {
  return (
    <Modal
      title="Select Midi device"
      bodyClass={styles.deviceSelect}
      onClose={() => setCandidate(null)}
    >
      <div>
        Please choose which MIDI device you'd like to attach to. If you want to
        change which device you are using simply open this dialog again.
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
      {candidateList.map((c, i) => (
        <Button key={i} onClick={() => setCandidate(c)}>
          {c.name}
        </Button>
      ))}
    </Modal>
  );
}
