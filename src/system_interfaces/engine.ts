import { fromBinary, toBinary } from '@bufbuild/protobuf';
import { Project, ProjectSchema } from '@dmx-controller/proto/project_pb';
import {
  WledRenderTarget,
  WledRenderTargetSchema,
} from '@dmx-controller/proto/wled_pb';
import init, {
  init_engine,
  render_scene_dmx,
  render_scene_wled,
  update_project,
} from '@dmx-controller/wasm-engine';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  triggerDmxSubscriptions,
  triggerWledSubscriptions,
} from '../engine/renderRouter';
import { isTauri } from './util';

// Event payload types from Tauri backend
interface DmxRenderEvent {
  output_id: string;
  frame: number;
  data: number[];
}

interface WledRenderEvent {
  output_id: string;
  frame: number;
  data: number[];
}

export const updateProject = isTauri ? tauriUpdateProject : webUpdateProject;
export const renderDmxScene = isTauri ? tauriRenderDmxScene : webRenderDmxScene;
export const renderSceneWled = isTauri
  ? tauriRenderSceneWled
  : webRenderSceneWled;

if (!isTauri) {
  await init();
  await init_engine();
} else {
  initRenderListeners();
}

async function webUpdateProject(project: Project) {
  const projectBytes = toBinary(ProjectSchema, project);
  return await update_project(projectBytes);
}

async function tauriUpdateProject(project: Project) {
  const projectBinary = toBinary(ProjectSchema, project);
  await invoke<number[]>('update_project', {
    projectBinary: Array.from(projectBinary),
  });
}

async function webRenderDmxScene(
  outputId: bigint,
  systemT: bigint,
  frame: number,
) {
  return await render_scene_dmx(outputId, systemT, frame);
}

async function tauriRenderDmxScene(
  outputId: bigint,
  systemT: bigint,
  frame: number,
): Promise<Uint8Array> {
  const result = await invoke<number[]>('render_scene_dmx', {
    outputId: outputId.toString(),
    systemT: Number(systemT),
    frame,
  });
  return new Uint8Array(result);
}

async function webRenderSceneWled(
  outputId: bigint,
  systemT: bigint,
  frame: number,
): Promise<WledRenderTarget> {
  const renderTargetBin = await render_scene_wled(outputId, systemT, frame);
  return fromBinary(WledRenderTargetSchema, renderTargetBin);
}

async function tauriRenderSceneWled(
  outputId: bigint,
  systemT: bigint,
  frame: number,
): Promise<WledRenderTarget> {
  const renderTargetBin = await invoke<number[]>('render_scene_wled', {
    outputId: outputId.toString(),
    systemT: Number(systemT),
    frame,
  });
  return fromBinary(WledRenderTargetSchema, new Uint8Array(renderTargetBin));
}

/**
 * Initialize Tauri render event listeners.
 * Listeners exist for the lifetime of the application.
 */
async function initRenderListeners(): Promise<void> {
  if (!isTauri) {
    return;
  }

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
}
