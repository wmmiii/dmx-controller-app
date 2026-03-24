import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface AudioInputCandidate {
  name: string;
}

export async function listAudioInputs(): Promise<AudioInputCandidate[]> {
  return invoke('list_audio_inputs');
}

export async function connectAudioInput(deviceName: string): Promise<void> {
  return invoke('connect_audio_input', { deviceName });
}

export async function disconnectAudioInput(): Promise<void> {
  return invoke('disconnect_audio_input');
}

type AudioConnectionStatusListener = (
  deviceName: string,
  connected: boolean,
) => void;
const connectionListeners: Array<AudioConnectionStatusListener> = [];

export function subscribeToAudioConnectionStatus(
  listener: AudioConnectionStatusListener,
): () => void {
  connectionListeners.push(listener);
  return () => {
    const index = connectionListeners.indexOf(listener);
    if (index > -1) {
      connectionListeners.splice(index, 1);
    }
  };
}

listen<{ device_name: string; connected: boolean }>(
  'audio-beat-detection-status',
  (event) => {
    connectionListeners.forEach((l) =>
      l(event.payload.device_name, event.payload.connected),
    );
  },
);
