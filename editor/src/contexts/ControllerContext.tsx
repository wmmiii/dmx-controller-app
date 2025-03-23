import { createContext, useCallback, useContext, useEffect, useRef, useState, } from "react";
import { Modal } from "../components/Modal";
import { Button } from "../components/Button";
import { ProjectContext } from "./ProjectContext";

export type ControllerChannel = string;
export type ControlCommandType = 'msb' | 'lsb' | null;

export const ControllerContext = createContext({
  controllerName: null as string | null,
  connect: () => { },
  addListener: (_listener: (
    _channel: ControllerChannel,
    _value: number,
    _controlType: ControlCommandType) => void) => { },
  removeListener: (_listener: (
    _channel: ControllerChannel,
    _value: number,
    _controlType: ControlCommandType) => void) => { },
  output: (_channel: ControllerChannel, _value: number) => { },
});

interface MidiDevice {
  name: string,
  input: MIDIInput;
  output: MIDIOutput;
}

interface ControllerProviderImplProps {
  children: React.ReactNode;
}

export function ControllerProvider({ children, }: ControllerProviderImplProps): JSX.Element {
  const { project, lastLoad, save } = useContext(ProjectContext);

  const [controller, setController] = useState<MidiDevice | null>(null);
  const [candidateList, setCandidateList] = useState<any[] | null>(null);
  const inputListeners = useRef<Array<(channel: ControllerChannel, value: number, controlCommandType: ControlCommandType) => void>>([]);

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
      // Try to reconnect if last controller is known.
      if (project.lastControllerName != null) {
        const access = await navigator.requestMIDIAccess();
        const input =
          Array.from((access.inputs as any).values() as Iterable<MIDIInput>)
            .find((input) => input.name == project.lastControllerName);
        const output =
          Array.from((access.outputs as any).values() as Iterable<MIDIOutput>)
            .find((input) => input.name == project.lastControllerName);
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
      return;
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
      } else if (command > 143 && command < 160) {
        // Note on.
      } else if (command > 159 && command < 176) {
        // Pressure.
      } else if (command > 175 && command < 192) {
        // Control value.
        // https://nickfever.com/music/midi-cc-list
        if (data[1] < 32) {
          msbBuffer.set(data[1], data[2]);
          value = data[2] + (lsbBuffer.get(data[1] + 32) || 0) / 128;
          lsbBuffer.delete(data[1] + 32);
          controlCommandType = 'msb';
        } else if (data[1] > 31 && data[1] < 64) {
          lsbBuffer.set(data[1], data[2]);
          value = (msbBuffer.get(data[1] + 32) || 0) + data[2] / 128;
          msbBuffer.delete(data[1] + 32);
          controlCommandType = 'lsb';
        }
      } else {
        console.error('Unrecognized MIDI command!', command);
      }

      inputListeners.current.forEach((l) => l(`${command}, ${data[1]}`, value / 127, controlCommandType));
    };

    () => controller.input.onmidimessage = null;
  }, [controller, inputListeners]);

  const output = useCallback((c: ControllerChannel, value: number) => {
    const channel = c.split(' ').map((i) => parseInt(i)) as [number, number];
    value *= value * 127;
    if (channel[0] > 175 && channel[0] < 192) {
      controller?.output.send([channel[0], channel[1] - 32, Math.floor(value)]);
      const lsb = Math.floor((value % 1) * 127);
      controller?.output.send([channel[0], channel[1], lsb]);
    } else {
      controller?.output.send([channel[0], channel[1], value]);
    }
  }, [controller]);

  // Expose output function for debugging purposes.
  useEffect(() => {
    const global = (window || globalThis) as any;
    global['debugMidiOutput'] = output;
  }, [output]);

  return (
    <>
      <ControllerContext.Provider value={{
        controllerName: controller?.name || null,
        connect: connect,
        addListener: (listener) =>
          inputListeners.current.push(listener),
        removeListener: (listener) =>
          inputListeners.current.splice(inputListeners.current.indexOf(listener), 1),
        output: output,
      }}>
        {children}
      </ControllerContext.Provider>
      {
        candidateList &&
        <ControllerSelectionDialog
          candidateList={candidateList}
          setController={(controller) => {
            project.lastControllerName = controller?.name || '';
            if (controller?.name) {
              save('Enable auto-reconnect for midi controller.');
            } else {
              save('Disable auto-reconnect for midi controller.');
            }
            setController(controller);
            setCandidateList(null);
          }} />
      }
    </>
  );
}

interface ControllerSelectionDialogProps {
  candidateList: Array<{ name: string, device: MidiDevice }>;
  setController: (controller: MidiDevice | null) => void;
}

function ControllerSelectionDialog({ candidateList, setController }: ControllerSelectionDialogProps) {
  return (
    <Modal title="Select Midi device" onClose={() => setController(null)}>
      {
        candidateList.map((c, i) => (
          <Button
            key={i}
            onClick={() => setController(c.device)}>
            {c.name}
          </Button>
        ))
      }
    </Modal>
  );
}
