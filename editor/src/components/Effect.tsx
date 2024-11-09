import React, { createContext, useContext, useEffect, useState } from 'react';
import EffectState from './EffectState';
import IconBxRepeat from '../icons/IconBxRepeat';
import IconBxsSun from '../icons/IconBxsSun';
import IconPanTilt from '../icons/IconPanTilt';
import IconRgb from '../icons/IconRgb';
import styles from './Effect.module.scss';
import { Button } from './Button';
import { CSSProperties } from "react";
import { DEFAULT_EFFECT_COLOR } from '../util/styleUtils';
import { Effect as EffectProto, EffectTiming, Effect_RampEffect, Effect_RampEffect_EasingFunction, Effect_StaticEffect, FixtureState, FixtureState as FixtureStateProto, FixtureSequenceMapping, Effect_StrobeEffect } from "@dmx-controller/proto/effect_pb";
import { isFixtureState } from '../engine/effect';
import { NumberInput, ToggleInput } from './Input';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { ProjectContext } from '../contexts/ProjectContext';
import IconBxsBinoculars from '../icons/IconBxsBinoculars';
import IconBxsBolt from '../icons/IconBxsBolt';

export interface EffectAddress {
  track: number;
  layer: number;
  effect: number;
}

export const EffectSelectContext = createContext({
  selectedEffect: null as EffectProto | null,
  deleteSelectedEffect: () => { },
  selectEffect: (_selected: EffectAddress) => { },
  copyEffect: null as EffectProto | null,
});

interface EffectProps {
  className: string;
  style: CSSProperties;
  address: EffectAddress;
  effect: EffectProto;
  minMs: number;
  maxMs: number;
  pxToMs: (px: number) => number;
  snapToBeat: (t: number) => number;
}

export function Effect({
  className,
  style,
  address,
  effect,
  minMs,
  maxMs,
  pxToMs,
  snapToBeat,
}: EffectProps): JSX.Element {
  const { copyEffect, selectedEffect, selectEffect } = useContext(EffectSelectContext);
  const { save, update } = useContext(ProjectContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const [dragStart, setDragStart] = useState(false);
  const [dragEnd, setDragEnd] = useState(false);
  const [drag, setDrag] = useState<{ offsetMs: number, widthMs: number } | null>(null);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    if (copyEffect && effect === selectedEffect) {
      return setShortcuts([
        {
          shortcut: { key: 'KeyV', modifiers: ['ctrl'] },
          action: () => {
            Object.assign(
              effect,
              copyEffect.clone(),
              {
                endMs: effect.endMs,
                startMs: effect.startMs,
              });
            save('Paste effect.');
          },
          description: 'Paste effect from clipboard onto selected effect.'
        },
      ]);
    }
  }, [copyEffect, effect, selectedEffect, save]);

  const icons: Set<(props: any) => JSX.Element> = new Set();
  if (effect.effect.case === 'staticEffect') {
    style.background = effectColor(effect.effect.value.effect.value);
    effectIcons(effect.effect.value.effect.value).forEach(i => icons.add(i));
  } else if (effect.effect.case === 'rampEffect') {
    const start = effectColor(effect.effect.value.start.value);
    const end = effectColor(effect.effect.value.end.value);
    style.background = `linear-gradient(90deg, ${start} 0%, ${end} 100%)`;

    effectIcons(effect.effect.value.start.value).forEach(i => icons.add(i));
    effectIcons(effect.effect.value.end.value).forEach(i => icons.add(i));
  } else if (effect.effect.case === 'strobeEffect') {
    const start = effectColor(effect.effect.value.stateA.value);
    const end = effectColor(effect.effect.value.stateB.value);
    style.background = `linear-gradient(90deg, ${start} 0%, ${end} 100%)`;

    effectIcons(effect.effect.value.stateA.value).forEach(i => icons.add(i));
    effectIcons(effect.effect.value.stateB.value).forEach(i => icons.add(i));
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
        setChanged(false);
        selectEffect(address);
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
                snapToBeat(ms), maxMs), effect.startMs + 1);
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
            setChanged(true);
            update();
            e.preventDefault();
            e.stopPropagation();
          }}
          onMouseUp={(e) => {
            setDragStart(false);
            setDragEnd(false);
            setDrag(null);
            if (changed) {
              save('Change effect timing.')
            }
            e.preventDefault();
            e.stopPropagation();
          }}>
        </div>
      }
      <div className={styles.inner}>
        <div
          className={styles.icons}
          style={{ left: Math.max(0, -(style.left || 0)) }} >
          {Array.from(icons).map((I, i) => (
            <div key={i} className={styles.icon}>
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
  fixtureSequenceId?: number;
  className?: string;
  effect: T;
}

export function EffectDetails({
  fixtureSequenceId,
  className,
  effect,
}: EffectDetailsBaseProps<EffectProto>): JSX.Element {
  const { save } = useContext(ProjectContext)

  const classes = [styles.effectDetails, className];

  let details: JSX.Element;

  switch (effect.effect.case) {
    case 'staticEffect':
      details = (
        <StaticEffectDetails
          fixtureSequenceId={fixtureSequenceId}
          effect={effect.effect.value} />
      );
      break;
    case 'rampEffect':
      details = (
        <RampEffectDetails
          fixtureSequenceId={fixtureSequenceId}
          effect={effect.effect.value} />
      );
      break;
    case 'strobeEffect':
      details = (
        <StrobeEffectDetails effect={effect.effect.value} />
      );
      break;
    default:
      details = (
        <p>Unrecognized effect type: {(effect.effect as any).case}</p>
      );
  }

  return (
    <div className={classes.join(' ')}>
      <label>
        <span>Effect type</span>
        <select
          value={effect.effect.case}
          onChange={(e) => {
            let type: string;
            switch (e.target.value) {
              case 'staticEffect':
                effect.effect = {
                  value: new Effect_StaticEffect({
                    effect: {
                      case: 'state',
                      value: {},
                    }
                  }),
                  case: 'staticEffect',
                };
                type = 'static';
                break;
              case 'rampEffect':
                effect.effect = {
                  value: new Effect_RampEffect({
                    start: {
                      case: 'fixtureStateStart',
                      value: {},
                    },
                    end: {
                      case: 'fixtureStateEnd',
                      value: {},
                    },
                  }),
                  case: 'rampEffect',
                };
                type = 'ramp';
                break;
              case 'strobeEffect':
                effect.effect = {
                  value: new Effect_StrobeEffect({
                    stateAFames: 1,
                    stateBFames: 1,
                    stateA: {
                      case: 'fixtureStateA',
                      value: {},
                    },
                    stateB: {
                      case: 'fixtureStateB',
                      value: {},
                    },
                  }),
                  case: 'strobeEffect',
                };
                type = 'strobe';
                break;
              default:
                console.error('Unrecognized event type: ', e.target.value);
                return;
            }
            save(`Change effect type to ${type}.`);
          }}>
          <option value="staticEffect">Static Effect</option>
          <option value="rampEffect">Ramp Effect</option>
          <option value="strobeEffect">Strobe Effect</option>
        </select>
      </label>

      {
        effect.effect.case === 'rampEffect' &&
        <>
          <label>
            <span>Timing mode</span>
            <select
              value={effect.timingMode}
              onChange={(e) => {
                effect.timingMode = parseInt(e.target.value);
                save(`Change effect timing to ${effect.timingMode === EffectTiming.ONE_SHOT ? 'one shot' : 'beat'}.`);
              }}>
              <option value={EffectTiming.ONE_SHOT}>One Shot</option>
              <option value={EffectTiming.BEAT}>Beat</option>
            </select>
          </label>

          <label>
            <span>Timing multiplier</span>
            <NumberInput
              type="float"
              max={128}
              min={0}
              value={effect.timingMultiplier || 1}
              onChange={(v) => {
                effect.timingMultiplier = v;
                save(`Change effect timing multiplier to ${v}.`);
              }} />
          </label>

          <hr />

          <label>
            <span>Offset</span>
            <NumberInput
              type="float"
              max={128}
              min={-128}
              value={
                effect.offset.case === 'offsetMs' ?
                  effect.offset.value / 1000 :
                  effect.offset.value || 0
              }
              onChange={(v) => {
                if (effect.offset.case === 'offsetMs') {
                  v = Math.floor(v * 1000);
                }
                effect.offset.case = effect.offset.case || 'offsetBeat';
                effect.offset.value = v;
                save('Change effect offset.');
              }} />
          </label>

          {
            effect.offset.value ?
              <ToggleInput
                className={styles.toggle}
                value={effect.offset.case !== 'offsetBeat'}
                onChange={(value) => {
                  if (value && effect.offset.case === 'offsetBeat') {
                    effect.offset = {
                      case: 'offsetMs',
                      value: effect.offset.value * 1000,
                    };
                  } else if (!value && effect.offset.case === 'offsetMs') {
                    effect.offset = {
                      case: 'offsetBeat',
                      value: effect.offset.value / 1000,
                    };
                  }
                  save('Change effect offset type.');
                }}
                labels={{ left: 'Beat', right: 'Seconds' }} /> :
              <></>
          }

          <hr />

          <label>
            <span>Mirrored</span>
            <Button
              variant={effect.mirrored ? 'primary' : 'default'}
              onClick={() => {
                effect.mirrored = !effect.mirrored;
                save(`Changed effect mirrored status to ${effect.mirrored}.`);
              }}>
              Mirrored
            </Button>
          </label>
        </>
      }
      {details}
    </div>
  )
}

function effectColor(effect: FixtureState | FixtureSequenceMapping): string {
  const color = (effect as FixtureState)?.color?.value;
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

function effectIcons(effect: FixtureStateProto | FixtureSequenceMapping):
  Array<(props: any) => JSX.Element> {
  const fixtureEffect = effect as FixtureStateProto;
  const icons: Array<(props: any) => JSX.Element> = [];
  if (fixtureEffect?.color?.case != null) {
    icons.push(IconRgb);
  }
  if (fixtureEffect?.brightness != null) {
    icons.push(IconBxsSun);
  }
  if (fixtureEffect?.pan != null || fixtureEffect?.tilt != null) {
    icons.push(IconPanTilt);
  }
  if ((effect as FixtureSequenceMapping)?.fixtureSequenceId != null) {
    icons.push(IconBxRepeat);
  }
  if (fixtureEffect?.zoom != null) {
    icons.push(IconBxsBinoculars);
  }
  if (fixtureEffect?.strobe) {
    icons.push(IconBxsBolt);
  }
  return icons;
}

function StaticEffectDetails({
  fixtureSequenceId,
  effect,
}: EffectDetailsBaseProps<Effect_StaticEffect>): JSX.Element {
  const { save } = useContext(ProjectContext);

  return (
    <>
      <hr />
      <EffectState
        fixtureSequenceId={fixtureSequenceId}
        effect={effect.effect.value}
        onChange={(e) => {
          if (isFixtureState(e)) {
            effect.effect = {
              case: 'state',
              value: e,
            };
          } else {
            effect.effect = {
              case: 'fixtureSequence',
              value: e,
            };
          }
          save('Change static effect state.');
        }} />
    </>
  );
}

function RampEffectDetails({
  fixtureSequenceId,
  effect,
}: EffectDetailsBaseProps<Effect_RampEffect>): JSX.Element {
  const { save } = useContext(ProjectContext);

  return (
    <>
      <label>
        <span>Easing</span>
        <select
          value={effect.easing}
          onChange={(e) => {
            effect.easing = parseInt(e.target.value);
            save('Change effect easing type.');
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
      <hr />
      <h2>Start</h2>
      <EffectState
        fixtureSequenceId={fixtureSequenceId}
        effect={effect.start.value}
        onChange={(e) => {
          if (isFixtureState(e)) {
            effect.start = {
              case: 'fixtureStateStart',
              value: e,
            };
          } else {
            effect.start = {
              case: 'fixtureSequenceMappingStart',
              value: e,
            };
          }
          save('Change ramp effect start state.');
        }} />
      <hr />
      <h2>End</h2>
      <EffectState
        fixtureSequenceId={fixtureSequenceId}
        effect={effect.end.value}
        onChange={(e) => {
          if (isFixtureState(e)) {
            effect.end = {
              case: 'fixtureStateEnd',
              value: e,
            };
          } else {
            effect.end = {
              case: 'fixtureSequenceMappingEnd',
              value: e,
            };
          }
          save('Change ramp effect end state.');
        }} />
    </>
  );
}

function StrobeEffectDetails({
  fixtureSequenceId,
  effect,
}: EffectDetailsBaseProps<Effect_StrobeEffect>): JSX.Element {
  const { save } = useContext(ProjectContext);

  return (
    <>
      <label>
        <span>State A duration (frames)</span>
        <NumberInput
          title="speed"
          type="integer"
          min={1}
          max={10}
          value={effect.stateAFames}
          onChange={(value) => {
            effect.stateAFames = value;
            save(`Change strobe effect state A frames to ${value}.`);
          }} />
      </label>
      <label>
        <span>State B duration (frames)</span>
        <NumberInput
          title="speed"
          type="integer"
          min={1}
          max={10}
          value={effect.stateBFames}
          onChange={(value) => {
            effect.stateBFames = value;
            save(`Change strobe effect state B frames to ${value}.`);
          }} />
      </label>
      <hr />
      <h2>State A</h2>
      <EffectState
        fixtureSequenceId={fixtureSequenceId}
        effect={effect.stateA.value}
        onChange={(e) => {
          if (isFixtureState(e)) {
            effect.stateA = {
              case: 'fixtureStateA',
              value: e,
            };
            save('Change strobe effect A.');
          }
        }} />
      <hr />
      <h2>State B</h2>
      <EffectState
        fixtureSequenceId={fixtureSequenceId}
        effect={effect.stateB.value}
        onChange={(e) => {
          if (isFixtureState(e)) {
            effect.stateB = {
              case: 'fixtureStateB',
              value: e,
            };
            save('Change strobe effect B.');
          }
        }} />
    </>
  );
}
