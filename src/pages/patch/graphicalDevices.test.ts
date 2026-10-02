import { create } from '@bufbuild/protobuf';
import {
  VirtualMappingSchema,
  VirtualMapping_Rotate,
} from '@dmx-controller/proto/display_pb';
import { OutputSchema, PatchSchema } from '@dmx-controller/proto/output_pb';
import { PhysicalSegment_Rectangle_StripStart } from '@dmx-controller/proto/pixel_mapping_pb';

import {
  isOnDisplay,
  listGraphicalDevices,
  placedPixels,
  placedSize,
} from './graphicalDevices';

function patchWithSegments(
  segments: Array<
    | { case: 'line'; value: { length: number } }
    | {
        case: 'rectangle';
        value: {
          width: number;
          height: number;
          stripStart?: PhysicalSegment_Rectangle_StripStart;
          vertical?: boolean;
          serpentine?: boolean;
        };
      }
  >,
) {
  return create(PatchSchema, {
    outputs: {
      '7': create(OutputSchema, {
        name: 'Wall',
        output: {
          case: 'ddpOutput',
          value: { segments: segments.map((shape) => ({ shape })) },
        },
      }),
    },
  });
}

describe('graphicalDevices', () => {
  it('lists DDP segments as devices', () => {
    const devices = listGraphicalDevices(
      patchWithSegments([
        { case: 'line', value: { length: 3 } },
        { case: 'rectangle', value: { width: 2, height: 4 } },
      ]),
    );
    expect(devices.map((d) => [d.key, d.label, d.width, d.height])).toEqual([
      ['7:0', 'Wall / Segment 1', 3, 1],
      ['7:1', 'Wall / Segment 2', 2, 4],
    ]);
  });

  it('orders rectangle pixels by wiring', () => {
    const [device] = listGraphicalDevices(
      patchWithSegments([
        {
          case: 'rectangle',
          value: {
            width: 3,
            height: 2,
            stripStart: PhysicalSegment_Rectangle_StripStart.LOWER_RIGHT,
            serpentine: true,
          },
        },
      ]),
    );
    expect(device.pixels).toEqual([
      [2, 1],
      [1, 1],
      [0, 1],
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
  });

  it('rotates clockwise about the top-left offset', () => {
    const [device] = listGraphicalDevices(
      patchWithSegments([{ case: 'line', value: { length: 3 } }]),
    );
    const mapping = create(VirtualMappingSchema, {
      left: 5,
      top: 1,
      rotate: VirtualMapping_Rotate.DEG_90,
    });
    expect(placedPixels(device, mapping)).toEqual([
      [5, 1],
      [5, 2],
      [5, 3],
    ]);
    expect(placedSize(device, mapping.rotate)).toEqual({ width: 1, height: 3 });
  });

  it('flips before rotating', () => {
    const [device] = listGraphicalDevices(
      patchWithSegments([{ case: 'line', value: { length: 3 } }]),
    );
    const mapping = create(VirtualMappingSchema, {
      rotate: VirtualMapping_Rotate.DEG_270,
      flipHorizontally: true,
    });
    expect(placedPixels(device, mapping)).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
  });

  it('detects pixels hanging off the display', () => {
    const display = { width: 4, height: 2 };
    expect(isOnDisplay([3, 1], display)).toBe(true);
    expect(isOnDisplay([4, 1], display)).toBe(false);
    expect(isOnDisplay([-1, 0], display)).toBe(false);
  });
});
