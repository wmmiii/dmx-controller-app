import { fromBinary } from '@bufbuild/protobuf';
import {
  Visualizer,
  VisualizerCompilationResult,
  VisualizerCompilationResultSchema,
  VisualizerSchema,
} from '@dmx-controller/proto/visualizer_pb';
import { invoke } from '@tauri-apps/api/core';

export async function compileVisualizer(
  id: bigint,
  glslSource: string,
): Promise<VisualizerCompilationResult> {
  const bytes = await invoke<number[]>('compile_visualizer', {
    id: id.toString(),
    glslSource,
  });
  return fromBinary(VisualizerCompilationResultSchema, new Uint8Array(bytes));
}

export async function getBuiltinVisualizers(): Promise<
  Record<string, Visualizer>
> {
  const result = await invoke<Record<string, number[]>>(
    'get_builtin_visualizers',
  );
  return Object.fromEntries(
    Object.entries(result).map(([id, bytes]) => [
      id,
      fromBinary(VisualizerSchema, new Uint8Array(bytes)),
    ]),
  );
}
