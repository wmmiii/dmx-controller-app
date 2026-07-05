import { invoke } from '@tauri-apps/api/core';

export async function readCasBlob(digest: string): Promise<ArrayBuffer> {
  return await invoke<ArrayBuffer>('read_cas_blob', { digest });
}

export async function importAudioFile(): Promise<bigint | null> {
  const id = await invoke<string | null>('import_audio_file');
  return id != null ? BigInt(id) : null;
}
