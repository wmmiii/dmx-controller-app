import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface AudioInputDevice {
  name: string;
}

export interface AudioAnalysis {
  /** 16 logarithmically-spaced frequency bands from ~40 Hz to ~20 kHz. */
  bands: number[];
  all: number;
}

// Device list change listeners
type DeviceListChangedListener = (devices: AudioInputDevice[]) => void;
const deviceListListeners: Array<DeviceListChangedListener> = [];

export function addDeviceListChangedListener(
  listener: DeviceListChangedListener,
) {
  deviceListListeners.push(listener);
}

export function removeDeviceListChangedListener(
  listener: DeviceListChangedListener,
) {
  const index = deviceListListeners.indexOf(listener);
  if (index > -1) {
    deviceListListeners.splice(index, 1);
  }
}

// Audio analysis listeners
type AudioAnalysisListener = (analysis: AudioAnalysis) => void;
const audioAnalysisListeners: Array<AudioAnalysisListener> = [];

export function addAudioAnalysisListener(listener: AudioAnalysisListener) {
  audioAnalysisListeners.push(listener);
  return () => {
    const index = audioAnalysisListeners.indexOf(listener);
    if (index > -1) {
      audioAnalysisListeners.splice(index, 1);
    }
  };
}

// Initialize event listeners at module load
listen<{ devices: AudioInputDevice[] }>(
  'audio-device-list-changed',
  (event) => {
    deviceListListeners.forEach((l) => l(event.payload.devices));
  },
);

listen<AudioAnalysis>('audio-input-analysis', (event) => {
  audioAnalysisListeners.forEach((l) => l(event.payload));
});

export async function listAudioInputs(): Promise<AudioInputDevice[]> {
  return invoke('list_audio_inputs');
}
