import { createContext, useContext, useEffect, useState } from 'react';
import IconBxsBinoculars from '../icons/IconBxsBinoculars';
import IconBxsBolt from '../icons/IconBxsBolt';
import IconBxsSun from '../icons/IconBxsSun';
import IconPanTilt from '../icons/IconPanTilt';
import IconRgb from '../icons/IconRgb';
import styles from './Effect.module.scss';
import { Button, IconButton } from './Button';
import { CSSProperties } from "react";
import { DEFAULT_EFFECT_COLOR, DEFAULT_EFFECT_COLOR_ALT } from '../util/styleUtils';
import { Effect as EffectProto, EffectTiming, Effect_RampEffect, Effect_RampEffect_EasingFunction, Effect_StaticEffect, FixtureState, FixtureState as FixtureStateProto, Effect_StrobeEffect } from "@dmx-controller/proto/effect_pb";
import { EffectState } from './EffectState';
import { NumberInput } from './Input';
import { ProjectContext } from '../contexts/ProjectContext';
import { RenderingContext } from '../contexts/RenderingContext';
import { ShortcutContext } from '../contexts/ShortcutContext';
import IconBxCheckbox from '../icons/IconBxCheckbox';
import IconBxLineChart from '../icons/IconBxLineChart';
import IconBxMove from '../icons/IconBxMove';
import IconBxPalette from '../icons/IconBxPalette';
import { Color, ColorPalette, PaletteColor } from '@dmx-controller/proto/color_pb';
import { PaletteContext } from '../contexts/PaletteContext';

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
  style: originalStyle,
  address,
  effect,
  minMs,
  maxMs,
  pxToMs,
  snapToBeat,
}: EffectProps): JSX.Element {
  const { copyEffect, selectedEffect, selectEffect } = useContext(EffectSelectContext);
  const { palette } = useContext(PaletteContext);
  const { save, update } = useContext(ProjectContext);
  const { beatWidthPx, msWidthToPxWidth } = useContext(RenderingContext);
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
    return undefined;
  }, [copyEffect, effect, selectedEffect, save]);


  // React makes the original style immutable so we clone it to modify it.
  const style = Object.assign({}, originalStyle);
  const icons: Set<(props: any) => JSX.Element> = new Set();
  if (effect.effect.case === 'staticEffect') {
    if (effect.effect.value.state) {
      style.background = effectColor(effect.effect.value.state, palette);
      effectIcons(effect.effect.value.state).forEach(i => icons.add(i));
    }
  } else if (effect.effect.case === 'rampEffect') {
    if (effect.effect.value.stateStart != null && effect.effect.value.stateEnd) {
      const start = effectColor(effect.effect.value.stateStart, palette);
      const end = effectColor(effect.effect.value.stateEnd, palette, true);
      let width: number;
      if (effect.timingMode === EffectTiming.BEAT) {
        width = beatWidthPx / (effect.timingMultiplier || 1);
      } else {
        width = msWidthToPxWidth(effect.endMs - effect.startMs) / (effect.timingMultiplier || 1);
      }
      if (effect.mirrored) {
        style.background = `repeating-linear-gradient(90deg, ${end} 0, ${start} ${width}px, ${end} ${width * 2}px)`;
      } else {
        style.background = `repeating-linear-gradient(90deg, ${start} 0, ${end} ${width}px)`;
      }

      effectIcons(effect.effect.value.stateStart).forEach(i => icons.add(i));
      effectIcons(effect.effect.value.stateEnd).forEach(i => icons.add(i));
    }
  } else if (effect.effect.case === 'strobeEffect') {
    if (effect.effect.value.stateA != null && effect.effect.value.stateB != null) {
      const start = effectColor(effect.effect.value.stateA, palette);
      const end = effectColor(effect.effect.value.stateB, palette, true);
      const aWidth = effect.effect.value.stateAFames * 2;
      const bWidth = effect.effect.value.stateBFames * 2;
      style.background = `repeating-linear-gradient(-45deg, ${start} 0, ${start} ${aWidth}px, ${end} ${aWidth}px, ${end} ${aWidth + bWidth}px)`;

      effectIcons(effect.effect.value.stateA).forEach(i => icons.add(i));
      effectIcons(effect.effect.value.stateB).forEach(i => icons.add(i));
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
  className?: string;
  effect: T;
  showTiming?: false;
  showPhase: boolean;
}

export function EffectDetails({
  className,
  effect,
  showTiming,
  showPhase,
}: EffectDetailsBaseProps<EffectProto>): JSX.Element {
  const { save } = useContext(ProjectContext);

  const classes = [styles.effectDetails, className];

  let details: JSX.Element;

  switch (effect.effect.case) {
    case 'staticEffect':
      details = (
        <StaticEffectDetails effect={effect.effect.value} showPhase={false} />
      );
      break;
    case 'rampEffect':
      details = (
        <RampEffectDetails effect={effect.effect.value} showTiming={showTiming} showPhase={showPhase} />
      );
      break;
    case 'strobeEffect':
      details = (
        <StrobeEffectDetails effect={effect.effect.value} showPhase={false} />
      );
      break;
    default:
      details = (
        <p>Unrecognized effect type: {JSON.stringify(effect.effect)}</p>
      );
  }

  return (
    <div className={classes.join(' ')}>
      <div className={styles.effectType}>
        <span>Effect type</span>
        <IconButton
          title="Static Effect"
          variant={effect.effect.case === 'staticEffect' ? 'primary' : 'default'}
          onClick={() => {
            if (effect.effect.case === 'rampEffect') {
              effect.effect = {
                case: 'staticEffect',
                value: new Effect_StaticEffect({
                  state: effect.effect.value.stateStart,
                }),
              };
              save('Change effect type to static.');
            } else if (effect.effect.case === 'strobeEffect') {
              effect.effect = {
                case: 'staticEffect',
                value: new Effect_StaticEffect({
                  state: effect.effect.value.stateA,
                }),
              };
              save('Change effect type to static.');
            }
          }}>
          <IconBxCheckbox />
        </IconButton>
        <IconButton
          title="Ramp Effect"
          variant={effect.effect.case === 'rampEffect' ? 'primary' : 'default'}
          onClick={() => {
            if (effect.effect.case === 'staticEffect') {
              if (effect.effect.value.state) {
                effect.effect = {
                  case: 'rampEffect',
                  value: new Effect_RampEffect({
                    stateStart: effect.effect.value.state.clone(),
                    stateEnd: effect.effect.value.state.clone(),
                  }),
                };
              } else {
                effect.effect = {
                  case: 'rampEffect',
                  value: new Effect_RampEffect({
                    stateStart: new FixtureState(),
                    stateEnd: new FixtureState(),
                  }),
                }
              }
              save('Change effect type to ramp.');
            } else if (effect.effect.case === 'strobeEffect') {
              if (effect.effect.value.stateA != null && effect.effect.value.stateB != null) {
                effect.effect = {
                  case: 'rampEffect',
                  value: new Effect_RampEffect({
                    stateStart: effect.effect.value.stateA.clone(),
                    stateEnd: effect.effect.value.stateB.clone(),
                  }),
                };
              } else {
                effect.effect = {
                  case: 'rampEffect',
                  value: new Effect_RampEffect({
                    stateStart: new FixtureState(),
                    stateEnd: new FixtureState(),
                  }),
                };
              }
              save('Change effect type to ramp.');
            }
          }}>
          <IconBxLineChart />
        </IconButton>
        <IconButton
          title="Strobe Effect"
          variant={effect.effect.case === 'strobeEffect' ? 'primary' : 'default'}
          onClick={() => {
            if (effect.effect.case === 'staticEffect') {
              if (effect.effect.value.state) {
                effect.effect = {
                  case: 'strobeEffect',
                  value: new Effect_StrobeEffect({
                    stateA: effect.effect.value.state.clone(),
                    stateB: effect.effect.value.state.clone(),
                  }),
                };
              } else {
                effect.effect = {
                  case: 'strobeEffect',
                  value: new Effect_StrobeEffect({
                    stateA: new FixtureState(),
                    stateB: new FixtureState(),
                  }),
                };
              }
              save('Change effect type to strobe.');
            } else if (effect.effect.case === 'rampEffect') {
              if (effect.effect.value.stateStart != null && effect.effect.value.stateEnd != null) {
                effect.effect = {
                  case: 'strobeEffect',
                  value: new Effect_StrobeEffect({
                    stateA: effect.effect.value.stateStart.clone(),
                    stateB: effect.effect.value.stateEnd.clone(),
                  }),
                };
              } else {
                effect.effect = {
                  case: 'strobeEffect',
                  value: new Effect_StrobeEffect({
                    stateA: new FixtureState(),
                    stateB: new FixtureState(),
                  }),
                };
              }
              save('Change effect type to strobe.');
            }
          }}>
          <IconBxsBolt />
        </IconButton>
      </div>
      <hr />
      {details}
    </div>
  )
}

function effectColor(state: FixtureState, palette: ColorPalette, alt = false): string {
  if (state.lightColor.case === 'color') {
    const color = state.lightColor.value;
    const white = Math.floor((color.white || 0) * 255);
    const r = Math.min(Math.floor(color.red * 255) + white, 255);
    const g = Math.min(Math.floor(color.green * 255) + white, 255);
    const b = Math.min(Math.floor(color.blue * 255) + white, 255);
    return `rgb(${r}, ${g}, ${b})`;
  } else if (state.lightColor.case === 'paletteColor') {
    let color: Color;
    switch (state.lightColor.value) {
      case PaletteColor.PALETTE_BLACK:
        return 'rgb(0, 0, 0)';
      case PaletteColor.PALETTE_WHITE:
        return 'rgb(255, 255, 255)';
      case PaletteColor.PALETTE_PRIMARY:
        if (palette.primary == null) {
          throw new Error('Tried to fetch primary color from undefined palette!')
        }
        if (palette.primary.color == null) {
          throw new Error('Primary color does not have a "color" field!');
        }
        color = palette.primary.color;
        break;
      case PaletteColor.PALETTE_SECONDARY:
        if (palette.secondary == null) {
          throw new Error('Tried to fetch secondary color from undefined palette!')
        }
        if (palette.secondary.color == null) {
          throw new Error('Primary color does not have a "color" field!');
        }
        color = palette.secondary.color;
        break;
      case PaletteColor.PALETTE_TERTIARY:
        if (palette.tertiary == null) {
          throw new Error('Tried to fetch tertiary color from undefined palette!')
        }
        if (palette.tertiary.color == null) {
          throw new Error('Primary color does not have a "color" field!');
        }
        color = palette.tertiary.color;
        break;
      default:
        throw new Error(`Unrecognized palette color type! ${state.lightColor}`);
    }
    const white = Math.floor((color.white || 0) * 255);
    const r = Math.min(Math.floor(color.red * 255) + white, 255);
    const g = Math.min(Math.floor(color.green * 255) + white, 255);
    const b = Math.min(Math.floor(color.blue * 255) + white, 255);
    return `rgb(${r}, ${g}, ${b})`;
  } else if (alt) {
    return DEFAULT_EFFECT_COLOR_ALT;
  } else {
    return DEFAULT_EFFECT_COLOR;
  }
}

function effectIcons(effect: FixtureStateProto):
  Array<(props: any) => JSX.Element> {
  const icons: Array<(props: any) => JSX.Element> = [];
  if (effect.lightColor.case === 'color') {
    icons.push(IconRgb);
  } else if (effect.lightColor.case === 'paletteColor') {
    icons.push(IconBxPalette);
  }
  if (effect?.dimmer != null) {
    icons.push(IconBxsSun);
  }
  if (effect?.pan != null || effect?.tilt != null) {
    icons.push(IconPanTilt);
  }
  if (effect?.height != null || effect?.width != null) {
    icons.push(IconBxMove);
  }
  if (effect?.zoom != null) {
    icons.push(IconBxsBinoculars);
  }
  if (effect?.strobe) {
    icons.push(IconBxsBolt);
  }
  return icons;
}

function StaticEffectDetails({ effect }: EffectDetailsBaseProps<Effect_StaticEffect>): JSX.Element {
  const { save } = useContext(ProjectContext);

  if (effect.state == null) {
    throw new Error('Static effect does not have a state!');
  }

  return (
    <>
      <hr />
      <EffectState
        state={effect.state}
        onChange={(s) => {
          effect.state = s;
          save('Change static effect state.');
        }} />
    </>
  );
}

function RampEffectDetails({ effect, showTiming, showPhase }: EffectDetailsBaseProps<Effect_RampEffect>): JSX.Element {
  const { save } = useContext(ProjectContext);
  if (effect.stateStart == null || effect.stateEnd == null) {
    throw new Error('Ramp effect does not have a state!');
  }

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
      {
        showTiming === undefined &&
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
      }

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

      {
        showPhase &&
        <label>
          <span>Phase</span>
          <NumberInput
            type="float"
            max={256}
            min={-256}
            value={effect.phase || 0}
            onChange={(v) => {
              effect.phase = v;
              save(`Change effect phase to ${v}.`);
            }} />
        </label>
      }

      <hr />
      <h2>Start</h2>
      <EffectState
        state={effect.stateStart}
        onChange={(s) => {
          effect.stateStart = s;
          save('Change ramp effect start state.');
        }} />
      <hr />
      <h2>End</h2>
      <EffectState
        state={effect.stateEnd}
        onChange={(s) => {
          effect.stateEnd = s;
          save('Change ramp effect end state.');
        }} />
    </>
  );
}

function StrobeEffectDetails({ effect }: EffectDetailsBaseProps<Effect_StrobeEffect>): JSX.Element {
  const { save } = useContext(ProjectContext);

  if (effect.stateA == null || effect.stateB == null) {
    throw new Error('Ramp effect does not have a state!');
  }

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
        state={effect.stateA}
        onChange={(s) => {
          effect.stateA = s;
          save('Change strobe effect A.');
        }} />
      <hr />
      <h2>State B</h2>
      <EffectState
        state={effect.stateB}
        onChange={(s) => {
          effect.stateB = s;
          save('Change strobe effect B.');
        }} />
    </>
  );
}
