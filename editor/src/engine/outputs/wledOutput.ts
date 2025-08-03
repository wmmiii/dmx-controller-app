import { create } from '@bufbuild/protobuf';
import { OutputSchema } from '@dmx-controller/proto/output_pb';
import { Project } from '@dmx-controller/proto/project_pb';
import { WledOutput } from '@dmx-controller/proto/wled_pb';
import { getActivePatch } from '../../util/projectUtils';
import { WritableWledOutput } from '../context';

export function createNewWledOutput() {
  return create(OutputSchema, {
    name: 'WLED Output',
    latencyMs: 0,
    output: {
      case: 'wledOutput',
      value: {
        segments: {},
      },
    },
  });
}

export function getWledWritableOutput(
  project: Project,
  outputId: bigint,
): WritableWledOutput {
  const output = getActivePatch(project).outputs[outputId.toString()];
  const wledOutput = output.output.value as WledOutput;

  const segments = Object.values(wledOutput.segments).map((segment) => ({
    effect: segment.defaultEffect,
    palette: segment.defaultPalette,
    primaryColor: {
      red: 0,
      green: 0,
      blue: 0,
    },
    speed: segment.defaultSpeed,
    brightness: segment.defaultBrightness,
  }));

  return {
    type: 'wled',
    outputId: outputId,
    segments: segments,
    clone: () => clone(outputId, segments),
    interpolate: (a, b, t) =>
      interpolate(
        segments,
        a as WritableWledOutput,
        b as WritableWledOutput,
        t,
      ),
  };
}

function clone(
  outputId: bigint,
  segments: WritableWledOutput['segments'],
): WritableWledOutput {
  const clonedSegments = segments.map((s) => {
    const clonedSegment = Object.assign({}, s);
    clonedSegment.primaryColor = Object.assign({}, s.primaryColor);
    return clonedSegment;
  });
  return {
    type: 'wled',
    outputId: outputId,
    segments: clonedSegments,
    clone: () => clone(outputId, clonedSegments),
    interpolate: (a, b, t) =>
      interpolate(
        clonedSegments,
        a as WritableWledOutput,
        b as WritableWledOutput,
        t,
      ),
  };
}

function interpolate(
  segments: WritableWledOutput['segments'],
  a: WritableWledOutput,
  b: WritableWledOutput,
  t: number,
) {
  for (let i = 0; i < segments.length; ++i) {
    const outputSegment = segments[i];
    const aSegment = a.segments[i];
    const bSegment = b.segments[i];

    // First, copy all values of whichever segment is more powerful.
    let dominantSegment: WritableWledOutput['segments'][number];
    if (t > 0.5) {
      dominantSegment = aSegment;
    } else {
      dominantSegment = bSegment;
    }
    Object.assign(outputSegment, dominantSegment);

    // Next, interpolate values.
    outputSegment.primaryColor = {
      red: aSegment.primaryColor.red * (1 - t) + bSegment.primaryColor.red * t,
      green:
        aSegment.primaryColor.green * (1 - t) + bSegment.primaryColor.green * t,
      blue:
        aSegment.primaryColor.blue * (1 - t) + bSegment.primaryColor.blue * t,
    };
    outputSegment.brightness =
      aSegment.brightness * (1 - t) + bSegment.brightness * t;
    outputSegment.speed = aSegment.speed * (1 - t) + bSegment.speed * t;
  }
}
