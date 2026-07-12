import { create } from '@bufbuild/protobuf';
import {
  TimecodedEffect,
  TimecodedEffectSchema,
} from '@dmx-controller/proto/effect_pb';

export const SNAP_THRESHOLD_PX = 8;
export const DEFAULT_BEAT_SUBDIVISIONS = 4;
export const MIN_BEAT_WIDTH_PX_FOR_SUBDIVISIONS = 80;
export const CREATE_DRAG_MIN_PX = 4;

const NO_BEAT_CREATE_DURATION_MS = 1000;
// Beat snap point generation is capped to keep pathological view ranges cheap.
const MAX_SNAP_POINTS = 10_000;

export interface IntervalMs {
  startMs: number;
  endMs: number;
}

export interface BeatMappings {
  msToBeat: (ms: number) => number;
  beatToMs: (beat: number) => number;
}

export interface TimelineViewport {
  viewStartMs: number;
  viewEndMs: number;
  widthPx: number;
}

export function msToPx(v: TimelineViewport, ms: number): number {
  const viewWidthMs = v.viewEndMs - v.viewStartMs;
  if (viewWidthMs <= 0) {
    return 0;
  }
  return ((ms - v.viewStartMs) / viewWidthMs) * v.widthPx;
}

export function pxToMs(v: TimelineViewport, px: number): number {
  if (v.widthPx <= 0) {
    return v.viewStartMs;
  }
  return v.viewStartMs + (px / v.widthPx) * (v.viewEndMs - v.viewStartMs);
}

export function msWidthToPxWidth(v: TimelineViewport, msWidth: number): number {
  const viewWidthMs = v.viewEndMs - v.viewStartMs;
  if (viewWidthMs <= 0) {
    return 0;
  }
  return (msWidth / viewWidthMs) * v.widthPx;
}

export function pxWidthToMsWidth(
  vp: TimelineViewport,
  pxWidth: number,
): number {
  if (vp.widthPx <= 0) {
    return 0;
  }
  return (pxWidth / vp.widthPx) * (vp.viewEndMs - vp.viewStartMs);
}

export function visibleSubdivisions(
  v: TimelineViewport,
  beat: BeatMappings | null,
  subdivisions: number,
): number {
  if (beat == null || subdivisions <= 1) {
    return Math.max(1, subdivisions);
  }
  const beatsInView = beat.msToBeat(v.viewEndMs) - beat.msToBeat(v.viewStartMs);
  if (beatsInView <= 0) {
    return 1;
  }
  const beatWidthPx = v.widthPx / beatsInView;
  return beatWidthPx >= MIN_BEAT_WIDTH_PX_FOR_SUBDIVISIONS ? subdivisions : 1;
}

export function snapPointsMs(
  beatMapping: BeatMappings | null,
  subdivisions: number,
  rangeStartMs: number,
  rangeEndMs: number,
): number[] {
  if (beatMapping == null || subdivisions < 1 || rangeEndMs <= rangeStartMs) {
    return [];
  }

  const firstIndex = Math.ceil(
    beatMapping.msToBeat(rangeStartMs) * subdivisions,
  );
  const lastIndex = Math.floor(beatMapping.msToBeat(rangeEndMs) * subdivisions);

  const points: number[] = [];
  points.push(rangeStartMs);
  for (
    let i = firstIndex;
    i <= lastIndex && points.length < MAX_SNAP_POINTS;
    i++
  ) {
    points.push(beatMapping.beatToMs(i / subdivisions));
  }
  points.push(rangeEndMs);
  return points;
}

export function occupiedIntervals(
  effects: TimecodedEffect[],
  exclude?: TimecodedEffect,
): IntervalMs[] {
  return effects
    .filter((e) => e !== exclude)
    .map((e) => ({ startMs: e.startMs, endMs: e.endMs }))
    .sort((a, b) => a.startMs - b.startMs);
}

export function snap(
  ms: number,
  candidatesMs: number[],
  toleranceMs: number,
): number {
  let best = ms;
  let bestDistance = Infinity;
  for (const candidate of candidatesMs) {
    const distance = Math.abs(candidate - ms);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return bestDistance <= toleranceMs ? best : ms;
}

export function findGapAt(
  occupied: IntervalMs[],
  ms: number,
  boundsStartMs: number,
  boundsEndMs: number,
): IntervalMs | null {
  let gapStartMs = boundsStartMs;
  let gapEndMs = boundsEndMs;
  for (const interval of occupied) {
    if (interval.startMs < ms && ms < interval.endMs) {
      return null;
    }
    if (interval.endMs <= ms) {
      gapStartMs = Math.max(gapStartMs, interval.endMs);
    }
    if (interval.startMs >= ms) {
      gapEndMs = Math.min(gapEndMs, interval.startMs);
      break;
    }
  }
  if (gapEndMs - gapStartMs <= 0 || ms < boundsStartMs || ms > boundsEndMs) {
    return null;
  }
  return { startMs: gapStartMs, endMs: gapEndMs };
}

/**
 * Takes a candidate span and attempts to find the closest logical spot for it.
 */
export function closestSpan(
  cursorMs: number,
  desiredStartMs: number,
  durationMs: number,
  occupied: IntervalMs[],
  boundsStartMs: number,
  boundsEndMs: number,
  snapPointsMs: number[],
  snapToleranceMs: number,
): IntervalMs | null {
  const clampedCursorMs = Math.min(
    Math.max(cursorMs, boundsStartMs),
    boundsEndMs,
  );
  const gap = findGapAt(occupied, clampedCursorMs, boundsStartMs, boundsEndMs);
  if (gap == null) {
    return null;
  }

  if (gap.endMs - gap.startMs <= durationMs) {
    return gap;
  }

  // Snapping a move shifts the whole span so its duration is preserved;
  // whichever edge is closest to a candidate wins.
  const candidates = snapPointsMs;
  let bestShift = 0;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    for (const shift of [
      candidate - desiredStartMs,
      candidate - (desiredStartMs + durationMs),
    ]) {
      if (Math.abs(shift) < bestDistance) {
        bestDistance = Math.abs(shift);
        bestShift = shift;
      }
    }
  }

  let startMs = desiredStartMs;
  if (bestDistance <= snapToleranceMs) {
    startMs += bestShift;
  }
  startMs = Math.min(Math.max(startMs, gap.startMs), gap.endMs - durationMs);
  return { startMs, endMs: startMs + durationMs };
}

export function resizeSpan(
  edge: 'start' | 'end',
  pointerMs: number,
  current: IntervalMs,
  occupied: IntervalMs[],
  boundsStartMs: number,
  boundsEndMs: number,
  snapPointsMs: number[],
  snapToleranceMs: number,
  minDurationMs: number = 1,
): IntervalMs {
  if (edge === 'start') {
    let limitMs = boundsStartMs;
    for (const interval of occupied) {
      if (interval.endMs <= current.startMs) {
        limitMs = Math.max(limitMs, interval.endMs);
      }
    }
    const snapped = snap(
      pointerMs,
      [...snapPointsMs, limitMs],
      snapToleranceMs,
    );
    const startMs = Math.min(
      Math.max(snapped, limitMs),
      current.endMs - minDurationMs,
    );
    return { startMs, endMs: current.endMs };
  } else {
    let limitMs = boundsEndMs;
    for (const interval of occupied) {
      if (interval.startMs >= current.endMs) {
        limitMs = Math.min(limitMs, interval.startMs);
      }
    }
    const snapped = snap(
      pointerMs,
      [...snapPointsMs, limitMs],
      snapToleranceMs,
    );
    const endMs = Math.max(
      Math.min(snapped, limitMs),
      current.startMs + minDurationMs,
    );
    return { startMs: current.startMs, endMs };
  }
}

export function createDragSpan(
  anchorMs: number,
  pointerMs: number,
  occupied: IntervalMs[],
  boundsStartMs: number,
  boundsEndMs: number,
  snapPointsMs: number[],
  snapToleranceMs: number,
): IntervalMs | null {
  const gap = findGapAt(occupied, anchorMs, boundsStartMs, boundsEndMs);
  if (gap == null) {
    return null;
  }

  const snappedAnchorMs = snap(anchorMs, snapPointsMs, snapToleranceMs);
  const snappedPointerMs = snap(pointerMs, snapPointsMs, snapToleranceMs);

  const clamp = (ms: number) => Math.min(Math.max(ms, gap.startMs), gap.endMs);
  return {
    startMs: clamp(Math.min(snappedAnchorMs, snappedPointerMs)),
    endMs: clamp(Math.max(snappedAnchorMs, snappedPointerMs)),
  };
}

export function beatFillSpan(
  clickMs: number,
  beatMapping: BeatMappings | null,
  occupied: IntervalMs[],
  boundsStartMs: number,
  boundsEndMs: number,
  fallbackDurationMs: number = NO_BEAT_CREATE_DURATION_MS,
): IntervalMs | null {
  const gap = findGapAt(occupied, clickMs, boundsStartMs, boundsEndMs);
  if (gap == null) {
    return null;
  }

  let desired: IntervalMs;
  if (beatMapping != null) {
    const beat = Math.floor(beatMapping.msToBeat(clickMs));
    desired = {
      startMs: beatMapping.beatToMs(beat),
      endMs: beatMapping.beatToMs(beat + 1),
    };
  } else {
    desired = { startMs: clickMs, endMs: clickMs + fallbackDurationMs };
  }

  const startMs = Math.max(desired.startMs, gap.startMs);
  const endMs = Math.min(desired.endMs, gap.endMs);
  if (endMs - startMs <= 0) {
    return null;
  }
  return { startMs, endMs };
}

export function createDefaultTimecodedEffect(
  span: IntervalMs,
): TimecodedEffect {
  return create(TimecodedEffectSchema, {
    startMs: Math.max(0, Math.round(span.startMs)),
    endMs: Math.max(0, Math.round(span.endMs)),
    effect: {
      effect: {
        case: 'rampEffect',
        value: {
          stateStart: {},
          stateEnd: {},
          timingMode: {
            timing: {
              case: 'oneShot',
              value: {},
            },
          },
        },
      },
    },
  });
}
