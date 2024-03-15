import React, { createContext, useContext, useMemo, useState } from 'react';
import { Effect as EffectProto, Effect_RampEffect, Effect_StaticEffect } from "@dmx-controller/proto/effect_pb";
import { CSSProperties } from "react";
import FixtureState from './FixtureState';

import styles from './Effect.module.scss';

export interface SelectedEffect {
  effect: EffectProto;
  delete: () => void;
}

export const EffectSelectContext = createContext({
  selectedEffect: null as EffectProto | null,
  deleteSelectedEffect: () => {},
  selectEffect: (_selected: SelectedEffect) => { },
});

interface EffectProps {
  className: string;
  style: CSSProperties;
  effect: EffectProto;
  minMs: number;
  maxMs: number;
  pxToMs: (px: number) => number;
  snapToBeat: (t: number) => number;
  save: () => void;
  onDelete: () => void;
  forceUpdate: () => void;
}

export function Effect({
  className,
  style,
  effect,
  minMs,
  maxMs,
  pxToMs,
  snapToBeat,
  save,
  onDelete,
  forceUpdate,
}: EffectProps): JSX.Element {
  const { selectedEffect, selectEffect } = useContext(EffectSelectContext);
  const [dragStart, setDragStart] = useState(false);
  const [dragEnd, setDragEnd] = useState(false);
  const [drag, setDrag] = useState<{ offsetMs: number, widthMs: number } | null>(null);

  if (effect.effect.case === 'staticEffect') {
    const color = effect.effect.value.state?.color?.value;
    if (color) {
      const r = Math.floor(color.red * 255);
      const g = Math.floor(color.green * 255);
      const b = Math.floor(color.blue * 255);
      style.background = `rgb(${r}, ${g}, ${b})`;
    }
  } else if (effect.effect.case === 'rampEffect') {
    const start = effect.effect.value.start.color.value || {
      red: 0,
      green: 0,
      blue: 0,
    };
    const end = effect.effect.value.end.color.value || {
      red: 0,
      green: 0,
      blue: 0,
    };
    const startR = Math.floor(start.red * 255);
    const startG = Math.floor(start.green * 255);
    const startB = Math.floor(start.blue * 255);
    const endR = Math.floor(end.red * 255);
    const endG = Math.floor(end.green * 255);
    const endB = Math.floor(end.blue * 255);
    style.background = `linear-gradient(90deg, rgb(${startR},${startG},${startB}) 0%, rgb(${endR},${endG},${endB}) 100%)`;
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
        selectEffect({
          effect: effect,
          delete: onDelete,
        });
        setDrag({
          offsetMs: pxToMs(e.clientX) - effect.startMs,
          widthMs: effect.endMs - effect.startMs,
        });
        e.preventDefault();
        e.stopPropagation();
      }}>
      {
        (dragStart || dragEnd || drag != null) &&
        <div
          className={styles.dragMask}
          style={{ cursor: maskCursor }}
          onMouseMove={(e) => {
            const ms = pxToMs(e.clientX);
            if (dragStart) {
              effect.startMs = Math.min(Math.max(
                snapToBeat(ms), minMs), effect.endMs - 1);
            } else if (dragEnd) {
              effect.endMs = Math.max(Math.min(
                snapToBeat(ms), maxMs), effect.startMs + 1);;
            } else if (drag != null) {
              const startMs = snapToBeat(ms - drag.offsetMs);
              const endMs = startMs + drag.widthMs;
              if (startMs < minMs) {
                effect.startMs = minMs;
                effect.endMs = minMs + drag.widthMs;
              } else if (endMs > maxMs) {
                effect.endMs = maxMs;
                effect.startMs = maxMs - drag.widthMs;
              } else {
                effect.startMs = startMs;
                effect.endMs = endMs;
              }
            }
            forceUpdate();
            e.preventDefault();
            e.stopPropagation();
          }}
          onMouseUp={(e) => {
            setDragStart(false);
            setDragEnd(false);
            setDrag(null);
            save();
            e.preventDefault();
            e.stopPropagation();
          }}>
        </div>
      }
      <div
        className={styles.dragStart}
        onMouseDown={(e) => {
          setDragStart(true);
          e.preventDefault();
          e.stopPropagation();
        }}>
      </div>
      <div
        className={styles.dragEnd}
        onMouseDown={(e) => {
          setDragEnd(true);
          e.preventDefault();
          e.stopPropagation();
        }}>
      </div>
    </div >
  );
}

interface EffectDetailsBaseProps<T> {
  className?: string;
  effect: T;
  onChange: (effect: T) => void;
}

export function EffectDetails({
  className,
  effect,
  onChange,
}: EffectDetailsBaseProps<EffectProto>): JSX.Element {

  const classes = [styles.effectDetails, className];

  let details: JSX.Element;

  switch (effect.effect.case) {
    case 'staticEffect':
      details = (
        <StaticEffectDetails
          effect={effect.effect.value}
          onChange={(e) => {
            effect.effect.value = e;
            onChange(effect);
          }} />
      );
      break;
    case 'rampEffect':
      details = (
        <RampEffectDetails
          effect={effect.effect.value}
          onChange={(e) => {
            effect.effect.value = e;
            onChange(effect);
          }} />
      );
      break;
    default:
      details = (
        <p>Unrecognized effect type: {effect.effect.case}</p>
      );
  }

  return (
    <div className={classes.join(' ')}>
      <select
        value={effect.effect.case}
        onChange={(e) => {
          switch (e.target.value) {
            case 'staticEffect':
              effect.effect = {
                value: new Effect_StaticEffect({
                  state: {},
                }),
                case: 'staticEffect',
              };
              break;
            case 'rampEffect':
              effect.effect = {
                value: new Effect_RampEffect({
                  start: {},
                  end: {},
                }),
                case: 'rampEffect',
              };
              break;
            default:
              console.error('Unrecognized event type: ', e.target.value);
              return;
          }
          onChange(effect);
        }}>
        <option value="staticEffect">Static Effect</option>
        <option value="rampEffect">Ramp Effect</option>
      </select>

      {details}
    </div>
  )
}

function StaticEffectDetails({
  effect,
  onChange,
}: EffectDetailsBaseProps<Effect_StaticEffect>): JSX.Element {
  return (
    <FixtureState
      state={effect.state}
      onChange={() => onChange(effect)} />
  );
}

function RampEffectDetails({
  effect,
  onChange,
}: EffectDetailsBaseProps<Effect_RampEffect>): JSX.Element {
  return (
    <>
      <h2>Start</h2>
      <FixtureState
        state={effect.start}
        onChange={() => onChange(effect)} />
      <h2>End</h2>
      <FixtureState
        state={effect.end}
        onChange={() => onChange(effect)} />
    </>
  );
}
