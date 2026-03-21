import { fromBinary, toBinary } from '@bufbuild/protobuf';
import { Project, ProjectSchema } from '@dmx-controller/proto/project_pb';
import { RenderMode, RenderModeSchema } from '@dmx-controller/proto/render_pb';
import {
  WledRenderTarget,
  WledRenderTargetSchema,
} from '@dmx-controller/proto/wled_pb';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  RenderError,
  triggerDmxSubscriptions,
  triggerErrorSubscriptions,
  triggerWledSubscriptions,
} from '../engine/renderRouter';

// Event payload types from Tauri backend
interface DmxRenderEvent {
  output_id: string;
  data: number[];
}

interface WledRenderEvent {
  output_id: string;
  data: number[];
}

interface RenderErrorEvent {
  output_id: string;
  message: string;
}

export async function updateProject(project: Project) {
  const projectBinary = toBinary(ProjectSchema, project);
  await invoke<number[]>('update_project', {
    projectBinary: Array.from(projectBinary),
  });
}

export async function setRenderMode(renderMode: RenderMode) {
  const renderModeBytes = toBinary(RenderModeSchema, renderMode);
  await invoke<number[]>('set_render_mode', {
    renderModeBinary: Array.from(renderModeBytes),
  });
}

export async function renderDmx(
  outputId: bigint,
  systemT: bigint,
  frame: number,
): Promise<Uint8Array> {
  const result = await invoke<number[]>('render_dmx', {
    outputId: outputId.toString(),
    systemT: Number(systemT),
    frame,
  });
  return new Uint8Array(result);
}

// DEAD CODE
export async function renderWled(
  outputId: bigint,
  systemT: bigint,
  frame: number,
): Promise<WledRenderTarget> {
  const renderTargetBin = await invoke<number[]>('render_wled', {
    outputId: outputId.toString(),
    systemT: Number(systemT),
    frame,
  });
  return fromBinary(WledRenderTargetSchema, new Uint8Array(renderTargetBin));
}

// Initialize Tauri render event listeners at module load
initRenderListeners();

/**
 * Initialize Tauri render event listeners.
 * Listeners exist for the lifetime of the application.
 */
async function initRenderListeners(): Promise<void> {
  // Listen for DMX render events from Tauri backend
  await listen<DmxRenderEvent>('dmx-render', (event) => {
    const payload = event.payload;
    const outputId = BigInt(payload.output_id);
    const data = new Uint8Array(payload.data);

    // Trigger subscriptions in renderRouter
    triggerDmxSubscriptions(outputId, data);
  });

  // Listen for WLED render events from Tauri backend
  await listen<WledRenderEvent>('wled-render', (event) => {
    const payload = event.payload;
    const outputId = BigInt(payload.output_id);
    const data = fromBinary(
      WledRenderTargetSchema,
      new Uint8Array(payload.data),
    );

    // Trigger subscriptions in renderRouter
    triggerWledSubscriptions(outputId, data);
  });

  // Listen for render error events from Tauri backend
  await listen<RenderErrorEvent>('render-error', (event) => {
    const payload = event.payload;
    const outputId = BigInt(payload.output_id);
    const error: RenderError = {
      outputId,
      message: payload.message,
    };

    // Trigger error subscriptions in renderRouter
    triggerErrorSubscriptions(outputId, error);
  });

  // Listen for render error clear events from Tauri backend
  await listen<string>('render-error-clear', (event) => {
    const outputId = BigInt(event.payload);
    // Trigger error subscriptions with null to clear the error
    triggerErrorSubscriptions(outputId, null);
  });
}
