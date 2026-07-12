import { TimecodedEffect } from '@dmx-controller/proto/effect_pb';
import { useContext, useEffect, useState } from 'react';

import { ProjectContext } from '../contexts/ProjectContext';
import {
  BeatMappings,
  CREATE_DRAG_MIN_PX,
  IntervalMs,
  SNAP_THRESHOLD_PX,
  TimelineViewport,
  beatFillSpan,
  closestSpan,
  createDefaultTimecodedEffect,
  createDragSpan,
  occupiedIntervals,
  pxToMs,
  pxWidthToMsWidth,
  resizeSpan,
} from '../util/timecodeUtils';

export type LaneInteractionState =
  | {
      type: 'create';
      laneIndex: number;
      anchorMs: number;
      startClientX: number;
      movedPx: number;
      preview: IntervalMs | null;
    }
  | {
      type: 'move';
      sourceLaneIndex: number;
      effect: TimecodedEffect;
      original: IntervalMs;
      grabOffsetMs: number;
      preview: { laneIndex: number; span: IntervalMs } | null;
      cursor: { laneIndex: number; ms: number };
    }
  | {
      type: 'resize';
      laneIndex: number;
      effect: TimecodedEffect;
      edge: 'start' | 'end';
      preview: IntervalMs;
    }
  | null;

export interface LaneInteraction {
  dragState: LaneInteractionState;
  startCreate: (laneIndex: number, ev: React.PointerEvent) => void;
  startMove: (
    laneIndex: number,
    effect: TimecodedEffect,
    ev: React.PointerEvent,
  ) => void;
  startResize: (
    laneIndex: number,
    effect: TimecodedEffect,
    edge: 'start' | 'end',
    ev: React.PointerEvent,
  ) => void;
  handleDoubleClick: (laneIndex: number, ev: React.MouseEvent) => void;
}

function roundInterval(span: IntervalMs): IntervalMs {
  return {
    startMs: Math.max(0, Math.round(span.startMs)),
    endMs: Math.max(0, Math.round(span.endMs)),
  };
}

export function useLaneInteraction(
  getLaneEffects: (laneIndex: number) => TimecodedEffect[],
  viewport: TimelineViewport,
  getLaneRects: () => DOMRect[],
  overlayRef: React.RefObject<HTMLDivElement | null>,
  converter: BeatMappings | null,
  snapPointsMs: number[],
  boundsEndMs: number,
  setSelected: (laneIndex: number, effectIndex: number) => void,
): LaneInteraction {
  const { save } = useContext(ProjectContext);
  const [dragState, setDragState] = useState<LaneInteractionState>(null);

  const snapToleranceMs = pxWidthToMsWidth(viewport, SNAP_THRESHOLD_PX);

  const msFromClientX = (clientX: number): number | null => {
    if (viewport.viewEndMs <= viewport.viewStartMs || viewport.widthPx <= 0) {
      return null;
    }
    const overlay = overlayRef.current;
    if (overlay == null) {
      return null;
    }
    return pxToMs(viewport, clientX - overlay.getBoundingClientRect().left);
  };

  const laneIndexFromClientY = (clientY: number): number | null => {
    const rects = getLaneRects();
    let best: number | null = null;
    let bestDistance = Infinity;
    for (let i = 0; i < rects.length; i++) {
      if (clientY >= rects[i].top && clientY <= rects[i].bottom) {
        return i;
      }
      const distance =
        clientY < rects[i].top
          ? rects[i].top - clientY
          : clientY - rects[i].bottom;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    return best;
  };

  const insertEffect = (laneIndex: number, effect: TimecodedEffect): number => {
    const effects = getLaneEffects(laneIndex);

    const nextIndex = effects.findIndex((e) => e.startMs > effect.startMs);
    const index = nextIndex < 0 ? effects.length : nextIndex;
    effects.splice(index, 0, effect);
    return index;
  };

  useEffect(() => {
    if (dragState == null) {
      return undefined;
    }

    const onPointerMove = (ev: PointerEvent) => {
      const pointerMs = msFromClientX(ev.clientX);
      if (pointerMs == null) {
        return;
      }

      if (dragState.type === 'create') {
        setDragState({
          ...dragState,
          movedPx: Math.max(
            dragState.movedPx,
            Math.abs(ev.clientX - dragState.startClientX),
          ),
          preview: createDragSpan(
            dragState.anchorMs,
            pointerMs,
            occupiedIntervals(getLaneEffects(dragState.laneIndex)),
            0,
            boundsEndMs,
            snapPointsMs,
            snapToleranceMs,
          ),
        });
      } else if (dragState.type === 'move') {
        const laneIndex =
          laneIndexFromClientY(ev.clientY) ?? dragState.cursor.laneIndex;
        const span = closestSpan(
          pointerMs,
          pointerMs - dragState.grabOffsetMs,
          dragState.original.endMs - dragState.original.startMs,
          occupiedIntervals(getLaneEffects(laneIndex), dragState.effect),
          0,
          boundsEndMs,
          snapPointsMs,
          snapToleranceMs,
        );
        setDragState({
          ...dragState,
          preview: span == null ? null : { laneIndex, span },
          cursor: { laneIndex, ms: pointerMs },
        });
      } else if (dragState.type === 'resize') {
        setDragState({
          ...dragState,
          preview: resizeSpan(
            dragState.edge,
            pointerMs,
            {
              startMs: dragState.effect.startMs,
              endMs: dragState.effect.endMs,
            },
            occupiedIntervals(
              getLaneEffects(dragState.laneIndex),
              dragState.effect,
            ),
            0,
            boundsEndMs,
            snapPointsMs,
            snapToleranceMs,
          ),
        });
      }
    };

    const onPointerUp = () => {
      if (dragState.type === 'create') {
        if (
          dragState.preview != null &&
          dragState.movedPx >= CREATE_DRAG_MIN_PX
        ) {
          const span = roundInterval(dragState.preview);
          if (span.endMs > span.startMs) {
            const index = insertEffect(
              dragState.laneIndex,
              createDefaultTimecodedEffect(span),
            );
            save('Add new effect.');
            setSelected(dragState.laneIndex, index);
          }
        }
      } else if (dragState.type === 'move') {
        if (dragState.preview != null) {
          const { laneIndex, span } = dragState.preview;
          const rounded = roundInterval(span);
          const unchanged =
            laneIndex === dragState.sourceLaneIndex &&
            rounded.startMs === dragState.original.startMs &&
            rounded.endMs === dragState.original.endMs;
          if (!unchanged && rounded.endMs > rounded.startMs) {
            const source = getLaneEffects(dragState.sourceLaneIndex);
            const sourceIndex = source.indexOf(dragState.effect);
            if (sourceIndex >= 0) {
              source.splice(sourceIndex, 1);
            }
            dragState.effect.startMs = rounded.startMs;
            dragState.effect.endMs = rounded.endMs;
            const index = insertEffect(laneIndex, dragState.effect);
            save('Move effect.');
            setSelected(laneIndex, index);
          }
        }
      } else if (dragState.type === 'resize') {
        const rounded = roundInterval(dragState.preview);
        const changed =
          rounded.startMs !== dragState.effect.startMs ||
          rounded.endMs !== dragState.effect.endMs;
        if (changed && rounded.endMs > rounded.startMs) {
          dragState.effect.startMs = rounded.startMs;
          dragState.effect.endMs = rounded.endMs;
          save('Change effect timing.');
        }
      }
      setDragState(null);
    };

    const onPointerCancel = () => setDragState(null);

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };
  });

  const startCreate = (laneIndex: number, ev: React.PointerEvent) => {
    const anchorMs = msFromClientX(ev.clientX);
    if (anchorMs == null) {
      return;
    }
    setDragState({
      type: 'create',
      laneIndex,
      anchorMs,
      startClientX: ev.clientX,
      movedPx: 0,
      preview: null,
    });
    ev.preventDefault();
  };

  const startMove = (
    laneIndex: number,
    effect: TimecodedEffect,
    ev: React.PointerEvent,
  ) => {
    const cursorMs = msFromClientX(ev.clientX);
    if (cursorMs == null) {
      return;
    }
    const original = { startMs: effect.startMs, endMs: effect.endMs };
    setDragState({
      type: 'move',
      sourceLaneIndex: laneIndex,
      effect,
      original,
      grabOffsetMs: cursorMs - effect.startMs,
      preview: { laneIndex, span: original },
      cursor: { laneIndex, ms: cursorMs },
    });
  };

  const startResize = (
    laneIndex: number,
    effect: TimecodedEffect,
    edge: 'start' | 'end',
    ev: React.PointerEvent,
  ) => {
    if (msFromClientX(ev.clientX) == null) {
      return;
    }
    setDragState({
      type: 'resize',
      laneIndex,
      effect,
      edge,
      preview: { startMs: effect.startMs, endMs: effect.endMs },
    });
  };

  const handleDoubleClick = (laneIndex: number, ev: React.MouseEvent) => {
    const clickMs = msFromClientX(ev.clientX);
    if (clickMs == null) {
      return;
    }
    const span = beatFillSpan(
      clickMs,
      converter,
      occupiedIntervals(getLaneEffects(laneIndex)),
      0,
      boundsEndMs,
    );
    if (span == null) {
      return;
    }
    const rounded = roundInterval(span);
    if (rounded.endMs <= rounded.startMs) {
      return;
    }
    const index = insertEffect(
      laneIndex,
      createDefaultTimecodedEffect(rounded),
    );
    save('Add new effect.');
    setSelected(laneIndex, index);
  };

  return { dragState, startCreate, startMove, startResize, handleDoubleClick };
}
