import {
  BaseDirectory,
  exists,
  readFile,
  writeFile,
} from '@tauri-apps/plugin-fs';

export async function getBlob(key: string): Promise<Uint8Array | null> {
  if (!(await exists(key, { baseDir: BaseDirectory.AppData }))) {
    return null;
  }

  return await readFile(key, { baseDir: BaseDirectory.AppData });
}

export async function storeBlob(key: string, value: Uint8Array): Promise<void> {
  await writeFile(key, value, { baseDir: BaseDirectory.AppData });
}
