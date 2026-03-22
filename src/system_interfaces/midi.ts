import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface MidiPortCandidate {
  id: string;
  name: string;
}

// MIDI message listeners
type MidiMessageListener = (deviceName: string, data: number[]) => void;
const messageListeners: Array<MidiMessageListener> = [];

export function addMidiListener(listener: MidiMessageListener) {
  messageListeners.push(listener);
}

export function removeMidiListener(listener: MidiMessageListener) {
  const index = messageListeners.indexOf(listener);
  if (index > -1) {
    messageListeners.splice(index, 1);
  }
}

// Connection status listeners
type ConnectionStatusListener = (
  deviceName: string,
  connected: boolean,
) => void;
const connectionListeners: Array<ConnectionStatusListener> = [];

export function addConnectionStatusListener(
  listener: ConnectionStatusListener,
) {
  connectionListeners.push(listener);
}

export function removeConnectionStatusListener(
  listener: ConnectionStatusListener,
) {
  const index = connectionListeners.indexOf(listener);
  if (index > -1) {
    connectionListeners.splice(index, 1);
  }
}

// Initialize event listeners at module load
listen<{ device_name: string; data: number[] }>('midi-message', (event) => {
  messageListeners.forEach((l) =>
    l(event.payload.device_name, event.payload.data),
  );
});

listen<{ controller_name: string; connected: boolean }>(
  'midi-connection-status',
  (event) => {
    connectionListeners.forEach((l) =>
      l(event.payload.controller_name, event.payload.connected),
    );
  },
);

export async function listMidiInputs(): Promise<MidiPortCandidate[]> {
  return invoke('list_midi_inputs');
}

export async function connectMidi(candidate: MidiPortCandidate) {
  return invoke('connect_midi', { candidate });
}

export async function disconnectMidi(candidate: MidiPortCandidate) {
  return invoke('disconnect_midi', { deviceName: candidate.name });
}

// Beat sampling state listener
type BeatSamplingStateListener = (sampling: boolean) => void;
const beatSamplingListeners: Array<BeatSamplingStateListener> = [];

export function subscribeToBeatSamplingState(
  listener: BeatSamplingStateListener,
): () => void {
  beatSamplingListeners.push(listener);
  return () => {
    const index = beatSamplingListeners.indexOf(listener);
    if (index > -1) {
      beatSamplingListeners.splice(index, 1);
    }
  };
}

// Initialize beat sampling state listener
listen<{ sampling: boolean }>('beat-sampling-state', (event) => {
  beatSamplingListeners.forEach((l) => l(event.payload.sampling));
});

// Beat sampling commands for keyboard shortcuts
export async function addBeatSample(): Promise<void> {
  return invoke('add_beat_sample');
}
