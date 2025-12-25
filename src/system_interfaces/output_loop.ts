import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './util';

export const outputLoopSupported = isTauri;

// Union type for output configurations
export type OutputLoopConfig =
  | { type: 'serial' }
  | { type: 'sacn'; universe: number; ipAddress: string }
  | { type: 'wled'; ipAddress: string };

export const startOutputLoop = isTauri
  ? tauriStartOutputLoop
  : webStartOutputLoop;
export const stopOutputLoop = isTauri ? tauriStopOutputLoop : webStopOutputLoop;
export const rebuildOutputLoops = isTauri
  ? tauriRebuildOutputLoops
  : webRebuildOutputLoops;

async function tauriStartOutputLoop(
  outputId: bigint,
  config: OutputLoopConfig,
): Promise<void> {
  await invoke('start_output_loop', {
    outputId: outputId.toString(),
    outputType: config.type,
    universe: 'universe' in config ? config.universe : undefined,
    ipAddress: 'ipAddress' in config ? config.ipAddress : undefined,
  });
}

async function webStartOutputLoop(
  _outputId: bigint,
  _config: OutputLoopConfig,
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
