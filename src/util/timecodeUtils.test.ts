import { create } from '@bufbuild/protobuf';
import { TimecodedEffectSchema } from '@dmx-controller/proto/effect_pb';

import {
  BeatMappings,
  MIN_BEAT_WIDTH_PX_FOR_SUBDIVISIONS,
  TimelineViewport,
  beatFillSpan,
  closestSpan,
  createDefaultTimecodedEffect,
  createDragSpan,
  findGapAt,
  msToPx,
  msWidthToPxWidth,
  occupiedIntervals,
  pxToMs,
  pxWidthToMsWidth,
  resizeSpan,
  snap,
  snapPointsMs,
  visibleSubdivisions,
} from './timecodeUtils';

// 120 BPM: one beat every 500ms.
const converter: BeatMappings = {
  msToBeat: (ms) => ms / 500,
  beatToMs: (beat) => beat * 500,
};

const viewport: TimelineViewport = {
  viewStartMs: 1000,
  viewEndMs: 3000,
  widthPx: 1000,
};

function effect(startMs: number, endMs: number) {
  return create(TimecodedEffectSchema, { startMs, endMs });
}

describe('timecodeUtils', () => {
  describe('viewport conversions', () => {
    it('maps view edges to lane edges', () => {
      expect(msToPx(viewport, 1000)).toBe(0);
      expect(msToPx(viewport, 3000)).toBe(1000);
      expect(pxToMs(viewport, 0)).toBe(1000);
      expect(pxToMs(viewport, 1000)).toBe(3000);
    });

    it('round-trips positions and widths', () => {
      expect(pxToMs(viewport, msToPx(viewport, 1234))).toBeCloseTo(1234);
      expect(
        pxWidthToMsWidth(viewport, msWidthToPxWidth(viewport, 250)),
      ).toBeCloseTo(250);
    });

    it('converts widths proportionally', () => {
      expect(msWidthToPxWidth(viewport, 500)).toBe(250);
      expect(pxWidthToMsWidth(viewport, 250)).toBe(500);
    });

    it('handles degenerate viewports', () => {
      const empty: TimelineViewport = {
        viewStartMs: 1000,
        viewEndMs: 1000,
        widthPx: 0,
      };
      expect(msToPx(empty, 2000)).toBe(0);
      expect(pxToMs(empty, 100)).toBe(1000);
      expect(msWidthToPxWidth(empty, 500)).toBe(0);
      expect(pxWidthToMsWidth(empty, 100)).toBe(0);
    });
  });

  describe('snapPointsMs', () => {
    it('emits subdivision points across the range', () => {
      expect(snapPointsMs(converter, 4, 0, 500)).toEqual([
        0, 0, 125, 250, 375, 500, 500,
      ]);
    });

    it('emits whole beats with subdivisions of 1', () => {
      expect(snapPointsMs(converter, 1, 0, 2000)).toEqual([
        0, 0, 500, 1000, 1500, 2000, 2000,
      ]);
    });

    it('includes the range boundaries in an off-boundary range', () => {
      expect(snapPointsMs(converter, 4, 130, 400)).toEqual([
        130, 250, 375, 400,
      ]);
    });

    it('returns nothing without a converter', () => {
      expect(snapPointsMs(null, 4, 0, 1000)).toEqual([]);
    });
  });

  describe('visibleSubdivisions', () => {
    const beatWidthViewport = (beatWidthPx: number): TimelineViewport => ({
      // 4 beats at 120 BPM in view.
      viewStartMs: 0,
      viewEndMs: 2000,
      widthPx: beatWidthPx * 4,
    });

    it('keeps subdivisions when beats are wide enough', () => {
      expect(
        visibleSubdivisions(
          beatWidthViewport(MIN_BEAT_WIDTH_PX_FOR_SUBDIVISIONS),
          converter,
          4,
        ),
      ).toBe(4);
    });

    it('degrades to whole beats when beats are too narrow', () => {
      expect(
        visibleSubdivisions(
          beatWidthViewport(MIN_BEAT_WIDTH_PX_FOR_SUBDIVISIONS - 1),
          converter,
          4,
        ),
      ).toBe(1);
    });

    it('returns whole beats without a converter or degenerate viewport', () => {
      expect(visibleSubdivisions(beatWidthViewport(200), null, 4)).toBe(4);
      expect(
        visibleSubdivisions(
          { viewStartMs: 0, viewEndMs: 0, widthPx: 1000 },
          converter,
          4,
        ),
      ).toBe(1);
    });
  });

  describe('snap', () => {
    it('snaps within tolerance', () => {
      expect(snap(495, [500], 10)).toBe(500);
    });

    it('snaps exactly at the tolerance boundary', () => {
      expect(snap(490, [500], 10)).toBe(500);
    });

    it('does not snap outside tolerance', () => {
      expect(snap(489, [500], 10)).toBe(489);
    });

    it('picks the nearest of multiple candidates', () => {
      expect(snap(505, [500, 512], 20)).toBe(500);
      expect(snap(507, [500, 512], 20)).toBe(512);
    });

    it('returns the input for no candidates', () => {
      expect(snap(123, [], 10)).toBe(123);
    });
  });

  describe('occupiedIntervals', () => {
    it('sorts and excludes the dragged effect', () => {
      const a = effect(1000, 2000);
      const b = effect(0, 500);
      expect(occupiedIntervals([a, b], a)).toEqual([
        { startMs: 0, endMs: 500 },
      ]);
      expect(occupiedIntervals([a, b])).toEqual([
        { startMs: 0, endMs: 500 },
        { startMs: 1000, endMs: 2000 },
      ]);
    });
  });

  describe('findGapAt', () => {
    const occupied = [
      { startMs: 500, endMs: 1000 },
      { startMs: 2000, endMs: 2500 },
    ];

    it('returns full bounds for an empty lane', () => {
      expect(findGapAt([], 100, 0, 10000)).toEqual({
        startMs: 0,
        endMs: 10000,
      });
    });

    it('finds the gap between intervals', () => {
      expect(findGapAt(occupied, 1500, 0, 10000)).toEqual({
        startMs: 1000,
        endMs: 2000,
      });
    });

    it('finds the gaps at the bounds edges', () => {
      expect(findGapAt(occupied, 100, 0, 10000)).toEqual({
        startMs: 0,
        endMs: 500,
      });
      expect(findGapAt(occupied, 3000, 0, 10000)).toEqual({
        startMs: 2500,
        endMs: 10000,
      });
    });

    it('returns null inside an interval', () => {
      expect(findGapAt(occupied, 700, 0, 10000)).toBeNull();
    });

    it('returns null between adjacent intervals', () => {
      const adjacent = [
        { startMs: 0, endMs: 500 },
        { startMs: 500, endMs: 1000 },
      ];
      expect(findGapAt(adjacent, 500, 0, 10000)).toBeNull();
    });

    it('returns null outside the bounds', () => {
      expect(findGapAt([], -100, 0, 10000)).toBeNull();
      expect(findGapAt([], 10100, 0, 10000)).toBeNull();
    });
  });

  describe('closestSpan', () => {
    const baseArgs = {
      durationMs: 400,
      occupied: [
        { startMs: 1000, endMs: 2000 },
        { startMs: 3000, endMs: 3500 },
      ],
      boundsStartMs: 0,
      boundsEndMs: 10000,
      snapPointsMs: [] as number[],
      snapToleranceMs: 20,
    };

    const run = (
      args: typeof baseArgs & { cursorMs: number; desiredStartMs: number },
    ) =>
      closestSpan(
        args.cursorMs,
        args.desiredStartMs,
        args.durationMs,
        args.occupied,
        args.boundsStartMs,
        args.boundsEndMs,
        args.snapPointsMs,
        args.snapToleranceMs,
      );

    it('keeps the desired position in open space', () => {
      expect(
        run({ ...baseArgs, cursorMs: 2500, desiredStartMs: 2300 }),
      ).toEqual({ startMs: 2300, endMs: 2700 });
    });

    it('clamps against the neighbor on the left', () => {
      expect(
        run({ ...baseArgs, cursorMs: 2100, desiredStartMs: 1900 }),
      ).toEqual({ startMs: 2000, endMs: 2400 });
    });

    it('clamps against the neighbor on the right', () => {
      expect(
        run({ ...baseArgs, cursorMs: 2900, desiredStartMs: 2800 }),
      ).toEqual({ startMs: 2600, endMs: 3000 });
    });

    it('is invalid when the cursor is over an occupied interval', () => {
      expect(
        run({ ...baseArgs, cursorMs: 1500, desiredStartMs: 1300 }),
      ).toBeNull();
    });

    it('jumps over an occupied region into the gap under the cursor', () => {
      expect(run({ ...baseArgs, cursorMs: 500, desiredStartMs: 900 })).toEqual({
        startMs: 600,
        endMs: 1000,
      });
    });

    it('shrinks to fill a gap smaller than the duration', () => {
      const occupied = [
        { startMs: 0, endMs: 1000 },
        { startMs: 1300, endMs: 2000 },
      ];
      expect(
        run({
          ...baseArgs,
          occupied,
          cursorMs: 1100,
          desiredStartMs: 1050,
        }),
      ).toEqual({ startMs: 1000, endMs: 1300 });
    });

    it('allows small same-lane moves when the dragged effect is excluded', () => {
      // The dragged effect [2200, 2600] is not in `occupied`.
      expect(
        run({ ...baseArgs, cursorMs: 2350, desiredStartMs: 2250 }),
      ).toEqual({ startMs: 2250, endMs: 2650 });
    });

    it('snaps the start edge to a beat point', () => {
      expect(
        run({
          ...baseArgs,
          snapPointsMs: [2500],
          cursorMs: 2600,
          desiredStartMs: 2490,
        }),
      ).toEqual({ startMs: 2500, endMs: 2900 });
    });

    it('snaps the end edge to a beat point when nearer', () => {
      expect(
        run({
          ...baseArgs,
          snapPointsMs: [2900],
          cursorMs: 2500,
          desiredStartMs: 2485,
        }),
      ).toEqual({ startMs: 2500, endMs: 2900 });
    });

    it('snaps to a neighbor edge over a farther beat point', () => {
      expect(
        run({
          ...baseArgs,
          snapPointsMs: [1985],
          cursorMs: 2100,
          desiredStartMs: 2005,
        }),
      ).toEqual({ startMs: 2000, endMs: 2400 });
    });

    it('respects the track bounds', () => {
      expect(
        run({
          ...baseArgs,
          occupied: [],
          cursorMs: 100,
          desiredStartMs: -200,
        }),
      ).toEqual({ startMs: 0, endMs: 400 });
      expect(
        run({
          ...baseArgs,
          occupied: [],
          boundsEndMs: 5000,
          cursorMs: 4900,
          desiredStartMs: 4800,
        }),
      ).toEqual({ startMs: 4600, endMs: 5000 });
    });
  });

  describe('resizeSpan', () => {
    const baseArgs = {
      current: { startMs: 1000, endMs: 2000 },
      occupied: [
        { startMs: 0, endMs: 500 },
        { startMs: 2500, endMs: 3000 },
      ],
      boundsStartMs: 0,
      boundsEndMs: 10000,
      snapPointsMs: [] as number[],
      snapToleranceMs: 20,
    };

    const run = (
      args: typeof baseArgs & { edge: 'start' | 'end'; pointerMs: number },
    ) =>
      resizeSpan(
        args.edge,
        args.pointerMs,
        args.current,
        args.occupied,
        args.boundsStartMs,
        args.boundsEndMs,
        args.snapPointsMs,
        args.snapToleranceMs,
      );

    it('moves the start edge and snaps to a beat point', () => {
      expect(
        run({
          ...baseArgs,
          edge: 'start',
          pointerMs: 990,
          snapPointsMs: [1000],
        }),
      ).toEqual({ startMs: 1000, endMs: 2000 });
    });

    it('clamps the start edge to the previous neighbor', () => {
      expect(run({ ...baseArgs, edge: 'start', pointerMs: 300 })).toEqual({
        startMs: 500,
        endMs: 2000,
      });
    });

    it('enforces the minimum duration on the start edge', () => {
      expect(run({ ...baseArgs, edge: 'start', pointerMs: 2400 })).toEqual({
        startMs: 1999,
        endMs: 2000,
      });
    });

    it('clamps the end edge to the next neighbor', () => {
      expect(run({ ...baseArgs, edge: 'end', pointerMs: 2800 })).toEqual({
        startMs: 1000,
        endMs: 2500,
      });
    });

    it('enforces the minimum duration on the end edge', () => {
      expect(run({ ...baseArgs, edge: 'end', pointerMs: 500 })).toEqual({
        startMs: 1000,
        endMs: 1001,
      });
    });

    it('snaps an edge to the neighbor limit within tolerance', () => {
      expect(run({ ...baseArgs, edge: 'end', pointerMs: 2485 })).toEqual({
        startMs: 1000,
        endMs: 2500,
      });
    });
  });

  describe('createDragSpan', () => {
    const baseArgs = {
      occupied: [{ startMs: 1000, endMs: 2000 }],
      boundsStartMs: 0,
      boundsEndMs: 10000,
      snapPointsMs: [] as number[],
      snapToleranceMs: 20,
    };

    const run = (
      args: typeof baseArgs & { anchorMs: number; pointerMs: number },
    ) =>
      createDragSpan(
        args.anchorMs,
        args.pointerMs,
        args.occupied,
        args.boundsStartMs,
        args.boundsEndMs,
        args.snapPointsMs,
        args.snapToleranceMs,
      );

    it('creates spans dragging forward and backward', () => {
      expect(run({ ...baseArgs, anchorMs: 2200, pointerMs: 2600 })).toEqual({
        startMs: 2200,
        endMs: 2600,
      });
      expect(run({ ...baseArgs, anchorMs: 2600, pointerMs: 2200 })).toEqual({
        startMs: 2200,
        endMs: 2600,
      });
    });

    it('snaps both edges', () => {
      expect(
        run({
          ...baseArgs,
          snapPointsMs: [2250, 2750],
          anchorMs: 2260,
          pointerMs: 2740,
        }),
      ).toEqual({ startMs: 2250, endMs: 2750 });
    });

    it('clamps to the gap containing the anchor', () => {
      expect(run({ ...baseArgs, anchorMs: 500, pointerMs: 2600 })).toEqual({
        startMs: 500,
        endMs: 1000,
      });
    });

    it('is null when the anchor is over an effect', () => {
      expect(run({ ...baseArgs, anchorMs: 1500, pointerMs: 2600 })).toBeNull();
    });
  });

  describe('beatFillSpan', () => {
    const baseArgs = {
      converter: converter as BeatMappings | null,
      occupied: [] as { startMs: number; endMs: number }[],
      boundsStartMs: 0,
      boundsEndMs: 10000,
    };

    const run = (args: typeof baseArgs & { clickMs: number }) =>
      beatFillSpan(
        args.clickMs,
        args.converter,
        args.occupied,
        args.boundsStartMs,
        args.boundsEndMs,
      );

    it('fills the beat containing the click', () => {
      // Click at beat 2.5 fills beats 2 through 3.
      expect(run({ ...baseArgs, clickMs: 1250 })).toEqual({
        startMs: 1000,
        endMs: 1500,
      });
    });

    it('clips the beat to the available gap', () => {
      expect(
        run({
          ...baseArgs,
          occupied: [{ startMs: 900, endMs: 1150 }],
          clickMs: 1250,
        }),
      ).toEqual({ startMs: 1150, endMs: 1500 });
    });

    it('is null when clicking over an effect', () => {
      expect(
        run({
          ...baseArgs,
          occupied: [{ startMs: 1200, endMs: 1300 }],
          clickMs: 1250,
        }),
      ).toBeNull();
    });

    it('falls back to a fixed duration without a converter', () => {
      expect(run({ ...baseArgs, converter: null, clickMs: 1250 })).toEqual({
        startMs: 1250,
        endMs: 2250,
      });
    });

    it('clips the fallback span to the gap and bounds', () => {
      expect(
        run({
          ...baseArgs,
          converter: null,
          occupied: [{ startMs: 1600, endMs: 2000 }],
          clickMs: 1250,
        }),
      ).toEqual({ startMs: 1250, endMs: 1600 });
      expect(
        run({
          ...baseArgs,
          converter: null,
          boundsEndMs: 1500,
          clickMs: 1250,
        }),
      ).toEqual({ startMs: 1250, endMs: 1500 });
    });
  });

  describe('createDefaultTimecodedEffect', () => {
    it('creates a one-shot ramp effect with a rounded span', () => {
      const created = createDefaultTimecodedEffect({
        startMs: 100.4,
        endMs: 500.6,
      });
      expect(created.startMs).toBe(100);
      expect(created.endMs).toBe(501);
      expect(created.effect?.effect.case).toBe('rampEffect');
      if (created.effect?.effect.case !== 'rampEffect') {
        throw new Error('Expected ramp effect');
      }
      expect(created.effect.effect.value.timingMode?.timing.case).toBe(
        'oneShot',
      );
    });

    it('clamps negative values to zero', () => {
      const created = createDefaultTimecodedEffect({
        startMs: -10,
        endMs: 500,
      });
      expect(created.startMs).toBe(0);
    });
  });
});
