import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './util';

export const sacnSupported = isTauri;
export const outputDmxSacn = isTauri ? tauriOutputDmxSacn : webOutputDmxSacn;

async function tauriOutputDmxSacn(
  universe: number,
  ipAddress: String,
  data: Uint8Array,
): Promise<void> {
  await invoke('output_sacn_dmx', {
    universe: universe,
    ipAddress: ipAddress,
    data: Array.from(data),
  });
}

async function webOutputDmxSacn(
  _universe: number,
  _ipAddress: String,
  _data: Uint8Array,
): Promise<void> {
  throw new Error('Cannot send SACN from the web browser!');
}
