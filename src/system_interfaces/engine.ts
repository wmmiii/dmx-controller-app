import { toBinary } from '@bufbuild/protobuf';
import { Project, ProjectSchema } from '@dmx-controller/proto/project_pb';
import init, {
  init_engine,
  render_scene_dmx,
} from '@dmx-controller/wasm-engine';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './util';

export const renderDmxScene = isTauri ? tauriRenderDmxScene : webRenderDmxScene;

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
  try {
    const result = await invoke<number[]>('render_dmx_scene', {
      projectBinary: Array.from(projectBinary),
      outputId: outputId.toString(),
      systemT: Number(systemT),
      frame,
    });
    return new Uint8Array(result);
  } catch (e) {
    console.error('what the fuck', e);
    throw e;
  }
}
