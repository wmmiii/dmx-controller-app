import { ColorPalette } from '@dmx-controller/proto/color_pb';
import { OutputTarget } from '@dmx-controller/proto/output_pb';
import { Project } from '@dmx-controller/proto/project_pb';
import { WritableDeviceCache } from './fixtures/writableDevice';

interface BaseOutput<T> {
  outputId: bigint;
  clone: () => T;
  interpolate: (a: WritableOutput, b: WritableOutput, t: number) => void;
}

export interface WritableDmxOutput extends BaseOutput<WritableDmxOutput> {
  type: 'dmx';
  universe: number[];
  nonInterpolatedIndices: number[];
  uint8Array: Uint8Array;
}

export interface WritableWledOutput extends BaseOutput<WritableWledOutput> {
  type: 'wled';
  segments: Array<{
    effect: number;
    palette: number;
    primaryColor: {
      red: number;
      green: number;
      blue: number;
    };
    speed: number;
    brightness: number;
  }>;
}

export type WritableOutput = WritableDmxOutput | WritableWledOutput;

export interface RenderContext {
  readonly globalT: number;
  readonly t: number;
  readonly project: Project;
  readonly output: WritableOutput;
  readonly target: OutputTarget;
  readonly colorPalette: ColorPalette;
  readonly writableDeviceCache: WritableDeviceCache;
}
