import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './util';

export const outputLoopSupported = isTauri;

export const startOutputLoop = isTauri
  ? tauriStartOutputLoop
  : webStartOutputLoop;
export const stopOutputLoop = isTauri
  ? tauriStopOutputLoop
  : webStopOutputLoop;
export const rebuildOutputLoops = isTauri
  ? tauriRebuildOutputLoops
  : webRebuildOutputLoops;

async function tauriStartOutputLoop(
  outputId: bigint,
  outputType: 'serial' | 'sacn' | 'wled',
  options: {
    universe?: number;
    ipAddress?: string;
    targetFps?: number;
  } = {},
): Promise<void> {
  await invoke('start_output_loop', {
    outputId: outputId.toString(),
    outputType,
    universe: options.universe,
    ipAddress: options.ipAddress,
    targetFps: options.targetFps || 30,
  });
}

async function webStartOutputLoop(
  _outputId: bigint,
  _outputType: 'serial' | 'sacn' | 'wled',
  _options?: {
    universe?: number;
    ipAddress?: string;
    targetFps?: number;
  },
): Promise<void> {
  // Web version uses the existing JavaScript render loops in React contexts
  // This function is a no-op on web
}

async function tauriStopOutputLoop(outputId: bigint): Promise<void> {
  await invoke('stop_output_loop', {
    outputId: outputId.toString(),
  });
}

async function webStopOutputLoop(_outputId: bigint): Promise<void> {
  // Web version uses the existing JavaScript render loops in React contexts
  // This function is a no-op on web
}

async function tauriRebuildOutputLoops(): Promise<void> {
  await invoke('rebuild_output_loops');
}

async function webRebuildOutputLoops(): Promise<void> {
  // Web version uses the existing JavaScript render loops in React contexts
  // This function is a no-op on web
}
