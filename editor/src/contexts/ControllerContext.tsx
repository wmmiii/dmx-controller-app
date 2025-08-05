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

interface MidiDevice {
  name: string;
  input: MIDIInput;
  output: MIDIOutput;
}

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

  const { addBeatSample } = useContext(BeatContext);
  const { addListener: addTimeListener, removeListener: removeTimeListener } =
    useContext(TimeContext);

  const [controller, setController] = useState<MidiDevice | null>(null);
  const [candidateList, setCandidateList] = useState<any[] | null>(null);
  const inputListeners = useRef<Array<Listener>>([]);

  const connect = useCallback(async () => {
    const access = await navigator.requestMIDIAccess();
    const inputs: MIDIInput[] = Array.from((access.inputs as any).values());
    const outputs: MIDIOutput[] = Array.from((access.outputs as any).values());
    const candidates = inputs
      .map((i) => {
        const o = outputs.find((o) => o.name === i.name);
        if (o != null) {
          return {
            name: i.name,
            device: {
              name: i.name,
              input: i,
              output: o,
            },
          };
        } else {
          return null;
        }
      })
      .filter((d) => d != null);
    setCandidateList(candidates);
  }, []);

  useEffect(() => {
    (async () => {
      const controllerMapping = project.controllerMapping;
      // Try to reconnect if last controller is known.
      if (controllerMapping?.lastControllerName) {
        const access = await navigator.requestMIDIAccess();
        const input = Array.from(
          (access.inputs as any).values() as Iterable<MIDIInput>,
        ).find((input) => input.name == controllerMapping.lastControllerName);
        const output = Array.from(
          (access.outputs as any).values() as Iterable<MIDIOutput>,
        ).find((input) => input.name == controllerMapping.lastControllerName);
        if (input != null && output != null) {
          setController({
            name: input.name,
            input: input,
            output: output,
          } as MidiDevice);
        }
      }
    })();
  }, [lastLoad, setController]);

  useEffect(() => {
    if (controller == null) {
      return () => {};
    }

    let msbBuffer: Map<number, number> = new Map();
    let lsbBuffer: Map<number, number> = new Map();
    controller.input.onmidimessage = (event) => {
      const data = (event as any).data;
      if (data == null) {
        return;
      }

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

    return () => (controller.input.onmidimessage = null);
  }, [controller, inputListeners, projectRef]);

  const output = useCallback(
    (c: ControllerChannel, value: number) => {
      try {
        const channel = c.split(' ').map((i) => parseInt(i)) as [
          number,
          number,
        ];
        value *= 127;
        if (channel[0] < 32) {
          controller?.output.send([channel[0], channel[1], Math.floor(value)]);
          const lsb = Math.floor((value % 1) * 127);
          controller?.output.send([channel[0], channel[1] + 32, lsb]);
        } else {
          controller?.output.send([channel[0], channel[1], value]);
        }
      } catch (ex) {
        console.error('Failed to send MIDI output!', ex);
      }
    },
    [controller],
  );

  useEffect(() => {
    const name = controller?.name;
    if (name) {
      const listener = (t: bigint) => outputValues(project, name, t, output);
      addTimeListener(listener);
      return () => removeTimeListener(listener);
    }
    return () => {};
  }, [project, controller, output, addTimeListener, removeTimeListener]);

  const addListener = useCallback((listener: Listener) => {
    inputListeners.current.push(listener);
  }, []);
  const removeListener = useCallback((listener: Listener) => {
    inputListeners.current.splice(inputListeners.current.indexOf(listener), 1);
  }, []);

  useEffect(() => {
    let timeout: any;
    const listener: Listener = (_p, channel, value, cct) => {
      const controllerName = controller?.name;
      if (controllerName) {
        const modified = performAction(
          project,
          controllerName,
          channel,
          value,
          cct,
          addBeatSample,
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
  }, [project, controller, addBeatSample, update, addListener, removeListener]);

  // Expose output function for debugging purposes.
  useEffect(() => {
    const global = (window || globalThis) as any;
    global['debugMidiOutput'] = output;
  }, [output]);

  return (
    <>
      <ControllerContext.Provider
        value={{
          controllerName: controller?.name || null,
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
          setController={(controller) => {
            project.controllerMapping!.lastControllerName =
              controller?.name || '';
            if (controller?.name) {
              save('Enable auto-reconnect for midi controller.');
            } else {
              save('Disable auto-reconnect for midi controller.');
            }
            setController(controller);
            setCandidateList(null);
          }}
        />
      )}
    </>
  );
}

interface ControllerSelectionDialogProps {
  candidateList: Array<{ name: string; device: MidiDevice }>;
  setController: (controller: MidiDevice | null) => void;
}

function ControllerSelectionDialog({
  candidateList,
  setController,
}: ControllerSelectionDialogProps) {
  return (
    <Modal title="Select Midi device" onClose={() => setController(null)}>
      {candidateList.map((c, i) => (
        <Button key={i} onClick={() => setController(c.device)}>
          {c.name}
        </Button>
      ))}
    </Modal>
  );
}
