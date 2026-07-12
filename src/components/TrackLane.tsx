import {
  Layer as LayerProto,
  TimecodedEffect as TimecodedEffectProto,
} from '@dmx-controller/proto/effect_pb';
import clsx from 'clsx';
import { CSSProperties, JSX } from 'react';

import { LaneInteraction } from '../hooks/laneInteraction';
import {
  IntervalMs,
  TimelineViewport,
  msToPx,
  msWidthToPxWidth,
} from '../util/timecodeUtils';

import { TimecodeEffect } from './TimecodeEffect';
import styles from './TrackLane.module.css';

interface TrackLaneProps {
  className?: string;
  style?: CSSProperties;
  laneIndex: number;
  layer: LayerProto;
  viewport: TimelineViewport;
  drag: LaneInteraction;
  selectedEffect: TimecodedEffectProto | null;
  onSelectEffect: (effectIndex: number) => void;
  copyEffect?: TimecodedEffectProto | null;
}

export function TrackLane({
  className,
  style,
  laneIndex,
  layer,
  viewport,
  drag,
  selectedEffect,
  onSelectEffect,
  copyEffect,
}: TrackLaneProps): JSX.Element {
  const spanStyle = (span: IntervalMs) => ({
    left: msToPx(viewport, span.startMs),
    width: msWidthToPxWidth(viewport, span.endMs - span.startMs),
  });

  const dragState = drag.dragState;
  const moveDrag = dragState?.type === 'move' ? dragState : null;
  const resizeDrag = dragState?.type === 'resize' ? dragState : null;
  const createDrag =
    dragState?.type === 'create' && dragState.laneIndex === laneIndex
      ? dragState
      : null;

  const moveGhostLaneIndex =
    moveDrag == null
      ? null
      : (moveDrag.preview?.laneIndex ?? moveDrag.cursor.laneIndex);
  const moveGhostInterval =
    moveDrag == null
      ? null
      : (moveDrag.preview?.span ?? {
          startMs: moveDrag.cursor.ms - moveDrag.grabOffsetMs,
          endMs:
            moveDrag.cursor.ms -
            moveDrag.grabOffsetMs +
            (moveDrag.original.endMs - moveDrag.original.startMs),
        });

  return (
    <div
      className={clsx(
        className,
        styles.lane,
        moveGhostLaneIndex === laneIndex && styles.dropTarget,
      )}
      style={style}
      data-track-lane
      onPointerDown={(ev) => {
        if (ev.target === ev.currentTarget) {
          drag.startCreate(laneIndex, ev);
        }
      }}
      onDoubleClick={(ev) => {
        if (ev.target === ev.currentTarget) {
          drag.handleDoubleClick(laneIndex, ev);
        }
      }}
    >
      {layer.effects.map((effect, i) => {
        if (moveDrag?.effect === effect) {
          return null;
        }
        const span =
          resizeDrag?.effect === effect ? resizeDrag.preview : effect;
        return (
          <TimecodeEffect
            key={i}
            className={styles.effect}
            style={spanStyle(span)}
            timecodeEffect={effect}
            selectedEffect={selectedEffect}
            setSelectedEffect={() => onSelectEffect(i)}
            copyEffect={copyEffect}
            onBodyPointerDown={(ev) => drag.startMove(laneIndex, effect, ev)}
            onStartHandlePointerDown={(ev) =>
              drag.startResize(laneIndex, effect, 'start', ev)
            }
            onEndHandlePointerDown={(ev) =>
              drag.startResize(laneIndex, effect, 'end', ev)
            }
          />
        );
      })}
      {moveDrag != null &&
        moveGhostLaneIndex === laneIndex &&
        moveGhostInterval != null && (
          <TimecodeEffect
            className={styles.effect}
            style={spanStyle(moveGhostInterval)}
            timecodeEffect={moveDrag.effect}
            selectedEffect={selectedEffect}
            ghost={true}
            invalid={moveDrag.preview == null}
          />
        )}
      {moveDrag?.sourceLaneIndex === laneIndex && (
        <div
          className={styles.originMarker}
          style={spanStyle(moveDrag.original)}
        />
      )}
      {createDrag?.preview != null && (
        <div
          className={styles.newEffect}
          style={spanStyle(createDrag.preview)}
        />
      )}
    </div>
  );
}

export function LaneDragMask({
  interaction,
}: {
  interaction: LaneInteraction;
}): JSX.Element | null {
  const dragState = interaction.dragState;
  if (dragState?.type !== 'move' && dragState?.type !== 'resize') {
    return null;
  }

  return (
    <div
      className={styles.dragMask}
      style={{
        cursor:
          dragState.type === 'resize'
            ? 'ew-resize'
            : dragState.preview == null
              ? 'not-allowed'
              : 'grabbing',
      }}
    />
  );
}
