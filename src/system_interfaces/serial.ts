import { invoke } from '@tauri-apps/api/core';

export async function listPorts(): Promise<string[]> {
  return invoke('list_ports');
}

// DEAD CODE
export async function openPort(
  outputId: bigint,
  portName: string | null,
): Promise<void> {
  try {
    return invoke('open_port', { outputId: outputId.toString(), portName });
  } catch (e) {
    console.error(e);
  }
}

// DEAD CODE
export async function closePort(outputId: bigint): Promise<string> {
  return invoke('close_port', { outputId: outputId.toString() });
}

// DEAD CODE
export async function outputDmx(
  outputId: bigint,
  data: Uint8Array,
): Promise<void> {
  await invoke('output_serial_dmx', {
    outputId: outputId.toString(),
    data: Array.from(data),
  });
}
