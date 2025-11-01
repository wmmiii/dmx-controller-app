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
} from '@dmx-controller/wasm-engine';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './util';

export const renderDmxScene = isTauri ? tauriRenderDmxScene : webRenderDmxScene;
export const renderSceneWled = isTauri
  ? tauriRenderSceneWled
  : webRenderSceneWled;

if (!isTauri) {
  await init();
  await init_engine();
}

async function webRenderDmxScene(
  project: Project,
  outputId: bigint,
  systemT: bigint,
  frame: number,
) {
  const projectBytes = toBinary(ProjectSchema, project);
  return await render_scene_dmx(projectBytes, outputId, systemT, frame);
}

async function tauriRenderDmxScene(
  project: Project,
  outputId: bigint,
  systemT: bigint,
  frame: number,
): Promise<Uint8Array> {
  const projectBinary = toBinary(ProjectSchema, project);
  const result = await invoke<number[]>('render_scene_dmx', {
    projectBinary: Array.from(projectBinary),
    outputId: outputId.toString(),
    systemT: Number(systemT),
    frame,
  });
  return new Uint8Array(result);
}

async function webRenderSceneWled(
  project: Project,
  outputId: bigint,
  systemT: bigint,
  frame: number,
): Promise<WledRenderTarget> {
  const projectBytes = toBinary(ProjectSchema, project);
  const renderTargetBin = await render_scene_wled(
    projectBytes,
    outputId,
    systemT,
    frame,
  );
  return fromBinary(WledRenderTargetSchema, renderTargetBin);
}

async function tauriRenderSceneWled(
  project: Project,
  outputId: bigint,
  systemT: bigint,
  frame: number,
): Promise<WledRenderTarget> {
  const projectBinary = toBinary(ProjectSchema, project);
  const renderTargetBin = await invoke<number[]>('render_scene_wled', {
    projectBinary: Array.from(projectBinary),
    outputId: outputId.toString(),
    systemT: Number(systemT),
    frame,
  });
  return fromBinary(WledRenderTargetSchema, new Uint8Array(renderTargetBin));
}
