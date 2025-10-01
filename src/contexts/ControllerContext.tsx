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
import { TimeContext } from './TimeContext';

import {
  MidiPortCandidate,
  addMidiListener,
  connectMidi,
  listMidiInputs,
  removeMidiListener,
  sendMidiCommand,
} from '../system_interfaces/midi';
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

  const { addBeatSample, setFirstBeat } = useContext(BeatContext);
  const { addListener: addTimeListener, removeListener: removeTimeListener } =
    useContext(TimeContext);

  const [controllerName, setControllerName] = useState<string | undefined>(
    undefined,
  );
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
        }
      }
    })();
  }, [lastLoad, setControllerName]);

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
          value = data[2] + (lsbBuffer.get(data[1] + 32) || 0) / 128;
          controlCommandType = 'msb';
        } else if (data[1] > 31 && data[1] < 64) {
          lsbBuffer.set(data[1], data[2]);
          value = (msbBuffer.get(data[1] - 32) || 0) + data[2] / 128;
          controlCommandType = 'lsb';
        }
        value /= 128;
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

  const output = useCallback((c: ControllerChannel, value: number) => {
    try {
      const channel = c.split(' ').map((i) => parseInt(i)) as [number, number];
      value *= 127;
      if (channel[0] < 32) {
        sendMidiCommand([channel[0], channel[1], Math.floor(value)]);
        const lsb = Math.floor((value % 1) * 127);
        sendMidiCommand([channel[0], channel[1] + 32, lsb]);
      } else {
        sendMidiCommand([channel[0], channel[1], value]);
      }
    } catch (ex) {
      console.error('Failed to send MIDI output!', ex);
    }
  }, []);

  useEffect(() => {
    if (controllerName) {
      const listener = (t: bigint) =>
        outputValues(project, controllerName, t, output);
      addTimeListener(listener);
      return () => removeTimeListener(listener);
    }
    return () => {};
  }, [project, controllerName, output, addTimeListener, removeTimeListener]);

  const addListener = useCallback((listener: Listener) => {
    inputListeners.current.push(listener);
  }, []);
  const removeListener = useCallback((listener: Listener) => {
    inputListeners.current.splice(inputListeners.current.indexOf(listener), 1);
  }, []);

  useEffect(() => {
    let timeout: any;
    const listener: Listener = (_p, channel, value, cct) => {
      if (controllerName) {
        const modified = performAction(
          project,
          controllerName,
          channel,
          value,
          cct,
          addBeatSample,
          setFirstBeat,
          output,
        );
        if (modified) {
          update();
          // Debounce midi input.
          clearTimeout(timeout);
          timeout = setTimeout(() => {
            save('Update via controller input.');
          }, 500);
        }
      }
    };
    addListener(listener);
    return () => removeListener(listener);
  }, [
    project,
    controllerName,
    addBeatSample,
    update,
    addListener,
    removeListener,
  ]);

  // Expose output function for debugging purposes.
  useEffect(() => {
    const global = (window || globalThis) as any;
    global['debugMidiOutput'] = output;
  }, [output]);

  return (
    <>
      <ControllerContext.Provider
        value={{
          controllerName: controllerName ?? null,
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
              save('Enable auto-reconnect for midi controller.');
              await connectMidi(candidate);
              setControllerName(name);
            } else {
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
