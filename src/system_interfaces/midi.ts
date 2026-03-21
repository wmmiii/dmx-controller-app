import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isTauri } from './util';

export interface MidiPortCandidate {
  id: string;
  name: string;
}

export const listMidiInputs = isTauri ? tauriListMidiInputs : webListMidiInputs;
export const connectMidi = isTauri ? tauriConnectMidi : webConnectMidi;
export const disconnectMidi = isTauri ? tauriDisconnectMidi : webDisconnectMidi;
export const sendControllerUpdate = isTauri
  ? tauriSendControllerUpdate
  : webSendControllerUpdate;

type MidiListener = (deviceName: string, data: number[]) => void;

const listeners: Array<MidiListener> = [];

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
  listen<{ device_name: string; data: number[] }>('midi-message', (event) => {
    listeners.forEach((l) => l(event.payload.device_name, event.payload.data));
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

async function tauriDisconnectMidi(candidate: MidiPortCandidate) {
  return invoke('disconnect_midi', { deviceName: candidate.name });
}

function tauriSendControllerUpdate(
  _deviceName: string,
  _calculateValues: () => Map<string, number>,
) {
  // Tauri handles MIDI output in its own async loop per device
}

const webMidiConnections = new Map<
  string,
  { input: MIDIInput; output?: MIDIOutput }
>();

async function webConnectMidi(candidate: MidiPortCandidate) {
  const access = await navigator.requestMIDIAccess();

  // Disconnect this specific device if already connected
  const existing = webMidiConnections.get(candidate.name);
  if (existing) {
    existing.input.onmidimessage = () => {};
    existing.input.close();
    existing.output?.close();
    webMidiConnections.delete(candidate.name);
  }

  const inputs: MIDIInput[] = Array.from((access.inputs as any).values());
  const input = inputs.find((i) => i.name === candidate.name);

  const outputs: MIDIOutput[] = Array.from((access.outputs as any).values());
  const output = outputs.find((i) => i.name === candidate.name);

  if (input) {
    const deviceName = candidate.name;
    input.onmidimessage = (event) => {
      const data = (event as any).data;
      if (data == null) {
        return;
      }
      listeners.forEach((l) => l(deviceName, data));
    };

    webMidiConnections.set(candidate.name, { input, output });
  }
}

async function webDisconnectMidi(candidate: MidiPortCandidate) {
  const conn = webMidiConnections.get(candidate.name);
  if (conn) {
    conn.input.onmidimessage = () => {};
    conn.input.close();
    conn.output?.close();
    webMidiConnections.delete(candidate.name);
  }
}

function webSendControllerUpdate(
  deviceName: string,
  calculateValues: () => Map<string, number>,
) {
  const conn = webMidiConnections.get(deviceName);
  if (!conn?.output) {
    return;
  }

  const values = calculateValues();
  for (let [c, value] of values.entries()) {
    try {
      const channel = c.split(' ').map((i) => parseInt(i)) as [number, number];
      value = Math.floor(value * 127);
      if (channel[0] < 32) {
        conn.output.send([channel[0], channel[1], value]);
        const lsb = Math.floor((value % 1) * 127);
        conn.output.send([channel[0], channel[1] + 32, lsb]);
      } else {
        conn.output.send([channel[0], channel[1], value]);
      }
    } catch (ex) {
      console.error('Failed to send MIDI output!', ex);
    }
  }
}
