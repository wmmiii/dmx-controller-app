import { invoke } from '@tauri-apps/api/core';

export async function getBeatT(): Promise<number | null> {
  return invoke('get_beat_t');
}
