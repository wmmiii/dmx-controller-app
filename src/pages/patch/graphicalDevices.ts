import {
  VirtualMapping,
  VirtualMapping_Rotate,
} from '@dmx-controller/proto/display_pb';
import { Patch } from '@dmx-controller/proto/output_pb';
import {
  PhysicalSegment,
  PhysicalSegment_Rectangle,
  PhysicalSegment_Rectangle_StripStart,
} from '@dmx-controller/proto/pixel_mapping_pb';

export type Pixel = readonly [x: number, y: number];

export type DeviceTransform = Pick<
  VirtualMapping,
  'left' | 'top' | 'rotate' | 'flipHorizontally' | 'flipVertically'
>;

/**
 * Any device whose pixels can be placed on a virtual display. Pixels are in
 * device-local coordinates and listed in wiring order.
 */
export interface GraphicalDevice {
  key: string;
  output: bigint;
  segment: bigint;
  outputName: string;
  label: string;
  width: number;
  height: number;
  pixels: Pixel[];
}

export function deviceKey(output: bigint, segment: bigint) {
  return `${output}:${segment}`;
}

export function listGraphicalDevices(patch: Patch): GraphicalDevice[] {
  return Object.entries(patch.outputs).flatMap(([outputId, output]) => {
    switch (output.output.case) {
      case 'ddpOutput':
        return output.output.value.segments.map((segment, i) => {
          const { width, height } = segmentDimensions(segment);
          return {
            key: deviceKey(BigInt(outputId), BigInt(i)),
            output: BigInt(outputId),
            segment: BigInt(i),
            outputName: output.name,
            label: `${output.name} / Segment ${i + 1}`,
            width,
            height,
            pixels: segmentPixels(segment),
          };
        });
      default:
        return [];
    }
  });
}

function segmentDimensions(segment: PhysicalSegment) {
  switch (segment.shape.case) {
    case 'line':
      return { width: segment.shape.value.length, height: 1 };
    case 'rectangle':
      return {
        width: segment.shape.value.width,
        height: segment.shape.value.height,
      };
    default:
      return { width: 0, height: 0 };
  }
}

// Mirrors `iter_segment_positions` in src-engine/src/render/segment_mapping.rs.
function segmentPixels(segment: PhysicalSegment): Pixel[] {
  switch (segment.shape.case) {
    case 'line':
      return Array.from(
        { length: segment.shape.value.length },
        (_, x) => [x, 0] as const,
      );
    case 'rectangle':
      return rectanglePixels(segment.shape.value);
    default:
      return [];
  }
}

function rectanglePixels(rect: PhysicalSegment_Rectangle): Pixel[] {
  const [primarySize, secondarySize] = rect.vertical
    ? [rect.width, rect.height]
    : [rect.height, rect.width];
  const startPrimaryAtEnd =
    rect.stripStart === PhysicalSegment_Rectangle_StripStart.LOWER_RIGHT ||
    rect.stripStart === PhysicalSegment_Rectangle_StripStart.LOWER_LEFT;
  const startSecondaryAtEnd =
    rect.stripStart === PhysicalSegment_Rectangle_StripStart.UPPER_RIGHT ||
    rect.stripStart === PhysicalSegment_Rectangle_StripStart.LOWER_RIGHT;

  const pixels: Pixel[] = [];
  for (let p = 0; p < primarySize; p++) {
    const reverseSecondary = rect.serpentine && p % 2 === 1;
    const primary = startPrimaryAtEnd ? primarySize - 1 - p : p;
    for (let s = 0; s < secondarySize; s++) {
      const secondary =
        startSecondaryAtEnd !== reverseSecondary ? secondarySize - 1 - s : s;
      pixels.push(rect.vertical ? [primary, secondary] : [secondary, primary]);
    }
  }
  return pixels;
}

export function isQuarterTurn(rotate: VirtualMapping_Rotate) {
  return (
    rotate === VirtualMapping_Rotate.DEG_90 ||
    rotate === VirtualMapping_Rotate.DEG_270
  );
}

export function placedSize(device: GraphicalDevice, rotate: VirtualMapping_Rotate) {
  return isQuarterTurn(rotate)
    ? { width: device.height, height: device.width }
    : { width: device.width, height: device.height };
}

// Mirrors `transform_to_virtual` in src-engine/src/render/segment_mapping.rs:
// flip in device space, rotate clockwise, then offset.
export function placedPixels(
  device: GraphicalDevice,
  mapping: DeviceTransform,
): Pixel[] {
  const { width, height } = device;
  return device.pixels.map(([px, py]) => {
    const x = mapping.flipHorizontally ? width - 1 - px : px;
    const y = mapping.flipVertically ? height - 1 - py : py;
    const [rx, ry] = (() => {
      switch (mapping.rotate) {
        case VirtualMapping_Rotate.DEG_90:
          return [height - 1 - y, x];
        case VirtualMapping_Rotate.DEG_180:
          return [width - 1 - x, height - 1 - y];
        case VirtualMapping_Rotate.DEG_270:
          return [y, width - 1 - x];
        default:
          return [x, y];
      }
    })();
    return [mapping.left + rx, mapping.top + ry] as const;
  });
}

export function isOnDisplay(
  [x, y]: Pixel,
  display: { width: number; height: number },
) {
  return x >= 0 && y >= 0 && x < display.width && y < display.height;
}
