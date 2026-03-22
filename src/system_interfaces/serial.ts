import { invoke } from '@tauri-apps/api/core';

export async function listPorts(): Promise<string[]> {
  return invoke('list_ports');
}
