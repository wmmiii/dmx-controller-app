import React, { createContext, useContext, useMemo, useState } from 'react';
import { Effect as EffectProto, EffectTiming, Effect_RampEffect, Effect_RampEffect_EasingFunction, Effect_StaticEffect, FixtureState as FixtureStateProto } from "@dmx-controller/proto/effect_pb";
import { CSSProperties } from "react";
import FixtureState from './FixtureState';

import styles from './Effect.module.scss';
import IconRgb from '../icons/IconRgb';
import IconBxsSun from '../icons/IconBxsSun';
import IconPanTilt from '../icons/IconPanTilt';
import { DEFAULT_EFFECT_COLOR } from '../util/styleUtils';

export interface SelectedEffect {
  effect: EffectProto;
  delete: () => void;
}

export const EffectSelectContext = createContext({
  selectedEffect: null as EffectProto | null,
  deleteSelectedEffect: () => { },
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

  const icons: Set<(props: any) => JSX.Element> = new Set();
  if (effect.effect.case === 'staticEffect') {
    style.background = stateColor(effect.effect.value.state);
    stateIcons(effect.effect.value.state).forEach(i => icons.add(i));
  } else if (effect.effect.case === 'rampEffect') {
    const start = stateColor(effect.effect.value.start);
    const end = stateColor(effect.effect.value.end);
    style.background = `linear-gradient(90deg, ${start} 0%, ${end} 100%)`;

    stateIcons(effect.effect.value.start).forEach(i => icons.add(i));
    stateIcons(effect.effect.value.end).forEach(i => icons.add(i));
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
      <div className={styles.inner}>
        <div className={styles.icons}>
          {Array.from(icons).map(I => (
            <div className={styles.icon}>
              <I />
            </div>
          ))}
        </div>
      </div>
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
      <label>
        Effect type:&nbsp;
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
      </label>

      <label>
        Timing mode:&nbsp;
        <select
          value={effect.timingMode}
          onChange={(e) => {
            const timing =
              Object.entries(EffectTiming)[parseInt(e.target.value)][0];
            effect.timingMode = (timing as any);
            onChange(effect);
          }}>
          <option value={EffectTiming.ONE_SHOT}>One Shot</option>
          <option value={EffectTiming.BEAT}>Beat</option>
        </select>
      </label>

      {details}
    </div>
  )
}

function stateColor(state: FixtureStateProto): string {
  const color = state?.color?.value;
  if (color) {
    const white = Math.floor((color.white || 0) * 255);
    const r = Math.min(Math.floor(color.red * 255) + white, 255);
    const g = Math.min(Math.floor(color.green * 255) + white, 255);
    const b = Math.min(Math.floor(color.blue * 255) + white, 255);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    return DEFAULT_EFFECT_COLOR;
  }
}

function stateIcons(state: FixtureStateProto):
  Array<(props: any) => JSX.Element> {
  const icons: Array<(props: any) => JSX.Element> = [];
  if (state.color.case != null) {
    icons.push(IconRgb);
  }
  if (state.brightness != null) {
    icons.push(IconBxsSun);
  }
  if (state.pan != null || state.tilt != null) {
    icons.push(IconPanTilt);
  }
  return icons;
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
      <label>
        Easing:&nbsp;
        <select
          value={effect.easing}
          onChange={(e) => {
            const easing =
              Object.entries(Effect_RampEffect_EasingFunction)[parseInt(e.target.value)][0];
            effect.easing = (easing as any);
            onChange(effect);
          }}>
          <option value={Effect_RampEffect_EasingFunction.LINEAR}>Linear</option>
          <option value={Effect_RampEffect_EasingFunction.EASE_IN}>
            Ease in
          </option>
          <option value={Effect_RampEffect_EasingFunction.EASE_OUT}>
            Ease out
          </option>
          <option value={Effect_RampEffect_EasingFunction.EASE_IN_OUT}>
            Ease in/out
          </option>
          <option value={Effect_RampEffect_EasingFunction.SINE}>
            Sine
          </option>
        </select>
      </label>
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
