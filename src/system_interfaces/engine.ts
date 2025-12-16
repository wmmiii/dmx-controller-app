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
import { isTauri } from './util';

export const updateProject = isTauri ? tauriUpdateProject : webUpdateProject;
export const renderDmxScene = isTauri ? tauriRenderDmxScene : webRenderDmxScene;
export const renderSceneWled = isTauri
  ? tauriRenderSceneWled
  : webRenderSceneWled;

if (!isTauri) {
  await init();
  await init_engine();
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
