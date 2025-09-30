import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './util';

type SerialPort = any;

let port: SerialPort = null;
let writer: any = null;

export const serialSupported = isTauri || 'serial' in navigator;
export const serialInit = isTauri ? () => {} : webInit;
export const listPorts = isTauri ? tauriListPorts : webListPorts;
export const openPort = isTauri ? tauriOpenPort : webOpenPort;
export const closePort = isTauri ? tauriClosePort : webClosePort;
export const outputDmx = isTauri ? tauriOutputDmx : webOutputDmx;

async function webInit(connect: () => void, disconnect: () => void) {
  (navigator as any).serial.onconnect = connect;
  (navigator as any).serial.ondisconnect = disconnect;
}

async function tauriListPorts(): Promise<string[]> {
  return invoke('list_ports');
}

async function webListPorts(): Promise<null> {
  const ports = await (navigator as any).serial.getPorts();
  if (ports.length === 0) {
    await (navigator as any).serial.requestPort();
  }
  return null;
}

async function tauriOpenPort(
  outputId: bigint,
  portName: string | null,
): Promise<void> {
  return invoke('open_port', { outputId: outputId.toString(), portName });
}

async function webOpenPort(): Promise<void> {
  webClosePort();

  const ports = await (navigator as any).serial.getPorts();
  port = ports[0];

  await port.open({
    baudRate: 192_000,
    dataBits: 8,
    flowControl: 'none',
    parity: 'none',
    stopBits: 2,
    bufferSize: 512,
  });

  writer = port.writable.getWriter();
}

async function tauriClosePort(outputId: bigint): Promise<string> {
  return invoke('close_port', { outputId: outputId.toString() });
}

async function webClosePort() {
  writer?.releaseLock();
  port?.close();
}

async function tauriOutputDmx(
  outputId: bigint,
  data: Uint8Array,
): Promise<void> {
  await invoke('output_dmx', {
    outputId: outputId.toString(),
    data: Array.from(data),
  });
}

async function webOutputDmx(
  _outputId: bigint,
  data: Uint8Array,
): Promise<void> {
  await writer?.ready;
  await writer?.write(data);
}
