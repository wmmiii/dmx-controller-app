import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isTauri } from './util';

export interface MidiPortCandidate {
  id: string;
  name: string;
}

export const listMidiInputs = isTauri ? tauriListMidiInputs : webListMidiInputs;
export const connectMidi = isTauri ? tauriConnectMidi : webConnectMidi;
export const sendControllerUpdate = isTauri
  ? () => {}
  : webSendControllerUpdate;

type MidiListener = (data: number[]) => void;

const listeners: Array<(data: number[]) => void> = [];

export function addMidiListener(listener: MidiListener) {
  listeners.push(listener);
}

export function removeMidiListener(listener: MidiListener) {
  const index = listeners.indexOf(listener);
  if (index > -1) {
    listeners.splice(index, 1);
  }
}

if (isTauri) {
  listen<{ data: number[] }>('midi-message', (event) => {
    listeners.forEach((l) => l(event.payload.data));
  });
}

async function tauriListMidiInputs(): Promise<MidiPortCandidate[]> {
  return invoke('list_midi_inputs');
}

async function webListMidiInputs(): Promise<MidiPortCandidate[]> {
  const access = await navigator.requestMIDIAccess();
  const inputs: MIDIInput[] = Array.from((access.inputs as any).values());
  return inputs.map((i) => ({
    id: i.id,
    name: i.name ?? 'Unknown',
  }));
}

async function tauriConnectMidi(candidate: MidiPortCandidate) {
  return invoke('connect_midi', { candidate });
}

let webMidiInput: MIDIInput | undefined;
let webMidiOutput: MIDIOutput | undefined;

async function webConnectMidi(candidate: MidiPortCandidate) {
  const access = await navigator.requestMIDIAccess();
  const inputs: MIDIInput[] = Array.from((access.inputs as any).values());
  if (webMidiInput) {
    webMidiInput.onmidimessage = () => {};
    webMidiInput.close();
  }
  webMidiInput = inputs.find((i) => i.name === candidate.name);
  const outputs: MIDIOutput[] = Array.from((access.outputs as any).values());
  if (webMidiOutput) {
    webMidiOutput.close();
  }
  webMidiOutput = outputs.find((i) => i.name === candidate.name);

  if (webMidiInput) {
    webMidiInput.onmidimessage = (event) => {
      const data = (event as any).data;
      if (data == null) {
        return;
      }
      listeners.forEach((l) => l(data));
    };
  }
}

function webSendControllerUpdate(calculateValues: () => Map<string, number>) {
  if (webMidiOutput) {
    const values = calculateValues();
    for (let [c, value] of values.entries()) {
      try {
        const channel = c.split(' ').map((i) => parseInt(i)) as [
          number,
          number,
        ];
        value = Math.floor(value * 127);
        if (channel[0] < 32) {
          webMidiOutput.send([channel[0], channel[1], value]);
          const lsb = Math.floor((value % 1) * 127);
          webMidiOutput.send([channel[0], channel[1] + 32, lsb]);
        } else {
          webMidiOutput.send([channel[0], channel[1], value]);
        }
      } catch (ex) {
        console.error('Failed to send MIDI output!', ex);
      }
    }
  }
}
