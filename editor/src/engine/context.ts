import { ColorPalette } from '@dmx-controller/proto/color_pb';
import { OutputTarget } from '@dmx-controller/proto/output_pb';
import { Project } from '@dmx-controller/proto/project_pb';
import { WritableDeviceCache } from './fixtures/writableDevice';

interface Output<T> {
  outputId: bigint;
  clone: () => T;
  interpolate: (a: T, b: T, t: number) => void;
}

export interface DmxOutput extends Output<DmxOutput> {
  type: 'dmx';
  universe: number[];
  nonInterpolatedIndices: number[];
  uint8Array: Uint8Array;
}

export type WritableOutput = DmxOutput;

export interface RenderContext {
  readonly globalT: number;
  readonly t: number;
  readonly project: Project;
  readonly output: WritableOutput;
  readonly target: OutputTarget;
  readonly colorPalette: ColorPalette;
  readonly writableDeviceCache: WritableDeviceCache;
}
