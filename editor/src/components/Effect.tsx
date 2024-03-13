import React, { createContext, useContext, useMemo, useState } from 'react';
import { Effect, Effect_StaticEffect } from "@dmx-controller/proto/effect_pb";
import { CSSProperties } from "react";
import FixtureState from './FixtureState';

import styles from './Effect.module.scss';

export const EffectSelectContext = createContext({
  selectedEffect: null as Effect | null,
  selectEffect: (_effect: Effect) => { },
});

interface EffectProps {
  className: string;
  style: CSSProperties;
  effect: Effect;
  minMs: number;
  maxMs: number;
  pxToMs: (px: number) => number;
  forceUpdate: () => void;
}

export function Effect({
  className,
  style,
  effect,
  minMs,
  maxMs,
  pxToMs,
  forceUpdate }: EffectProps): JSX.Element {
  const { selectedEffect, selectEffect } = useContext(EffectSelectContext);
  const [dragStart, setDragStart] = useState(false);
  const [dragEnd, setDragEnd] = useState(false);
  const [drag, setDrag] = useState<{ offset: number, width: number } | null>(null);

  if (effect.effect.case === 'staticEffect') {
    const fixtureState = effect.effect.value.state;
    const color = fixtureState.color.value;
    switch (fixtureState.color.case) {
      case 'rgb': // Fall-through
      case 'rgbw':
        const r = Math.floor(color.red * 255);
        const g = Math.floor(color.green * 255);
        const b = Math.floor(color.blue * 255);
        style.background = `rgba(${r}, ${g}, ${b}, 0.1)`;
        style.borderColor = `rgb(${r}, ${g}, ${b})`;
        break;
    }
  }

  const containerClasses = [styles.effect, className];
  if (effect === selectedEffect) {
    containerClasses.push(styles.selected);
  }

  const maskCursor = (dragStart || dragEnd) ? 'ew-resize' : 'grabbing';

  return (
    <div
      className={containerClasses.join(' ')}
      style={style}
      onMouseDown={(e) => {
        selectEffect(effect);
        setDrag({
          offset: pxToMs(e.clientX) - effect.startMs,
          width: effect.endMs - effect.startMs,
        });
      }}>
      {
        (dragStart || dragEnd || drag != null) &&
        <div
          className={styles.dragMask}
          style={{ cursor: maskCursor }}
          onMouseMove={(e) => {
            const ms = pxToMs(e.clientX);
            if (dragStart) {
              effect.startMs = Math.min(Math.max(ms, minMs), effect.endMs - 1);
            } else if (dragEnd) {
              effect.endMs = Math.max(Math.min(ms, maxMs), effect.startMs + 1);;
            } else if (drag != null) {
              const startMs = ms - drag.offset;
              const endMs = startMs + drag.width;
              if (startMs < minMs) {
                effect.startMs = minMs;
                effect.endMs = minMs + drag.width;
              } else if (endMs > maxMs) {
                effect.endMs = maxMs;
                effect.startMs = maxMs - drag.width;
              } else {
                effect.startMs = startMs;
                effect.endMs = endMs;
              }
            }
            forceUpdate();
          }}
          onMouseUp={() => {
            setDragStart(false);
            setDragEnd(false);
            setDrag(null);
          }}>
        </div>
      }
      <div
        className={styles.dragStart}
        onMouseDown={() => setDragStart(true)}>
      </div>
      <div
        className={styles.dragEnd}
        onMouseDown={() => setDragEnd(true)}>
      </div>
    </div >
  );
}



interface EffectDetailsBaseProps<T> {
  className: string;
  effect: T;
  onChange: (effect: T) => void;
}

export function EffectDetails(
  { className, effect, onChange }: EffectDetailsBaseProps<Effect>):
  JSX.Element {

  const classes = [styles.effectDetails, className];

  switch (effect.effect.case) {
    case 'staticEffect':
      return (
        <StaticEffectDetails
          className={classes.join(' ')}
          effect={effect.effect.value}
          onChange={(e) => {
            effect.effect.value = e;
            onChange(effect);
          }} />
      );
    case 'rampEffect':
      return (
        <div className={classes.join(' ')}>
          <h3>Ramp Effect</h3>
        </div>
      );
    default:
      return (
        <div className={classes.join(' ')}>
          <h3>Unrecognized Effect</h3>
        </div>
      );

  }
}

function StaticEffectDetails(
  { className, effect, onChange }: EffectDetailsBaseProps<Effect_StaticEffect>): JSX.Element {
  return (
    <div className={className}>
      <h3>Static Effect</h3>
      <FixtureState
        state={effect.state}
        onChange={() => onChange(effect)} />
    </div>
  );
}