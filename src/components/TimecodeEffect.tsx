import { clone, create } from '@bufbuild/protobuf';
import {
  PaletteColor,
  type Color,
  type ColorPalette,
} from '@dmx-controller/proto/color_pb';
import {
  Effect,
  EffectSchema,
  EffectTiming_AbsoluteSchema,
  EffectTiming_BeatSchema,
  EffectTiming_EasingFunction,
  EffectTiming_OneShotSchema,
  Effect_RampEffectSchema,
  Effect_RandomEffectSchema,
  Effect_SequenceEffect,
  Effect_SequenceEffectSchema,
  Effect_StaticEffectSchema,
  Effect_StrobeEffectSchema,
  FixtureStateSchema,
  SequenceSchema,
  TimecodedEffect as TimecodeEffectProto,
  TimecodedEffectSchema,
  type Effect_RampEffect,
  type Effect_RandomEffect,
  type Effect_StaticEffect,
  type Effect_StrobeEffect,
  type FixtureState,
  type FixtureState as FixtureStateProto,
} from '@dmx-controller/proto/effect_pb';
import { CSSProperties, JSX, useContext, useEffect, useState } from 'react';
import {
  BiDice6,
  BiLineChart,
  BiMove,
  BiPalette,
  BiPause,
  BiSolidBinoculars,
  BiSolidBolt,
  BiSun,
} from 'react-icons/bi';
import { LuChartBarStacked } from 'react-icons/lu';
import { MdSpeed } from 'react-icons/md';

import { EffectRenderingContext } from '../contexts/EffectRenderingContext';
import { PaletteContext } from '../contexts/PaletteContext';
import { ProjectContext } from '../contexts/ProjectContext';
import { ShortcutContext } from '../contexts/ShortcutContext';
import { ChannelTypes } from '../engine/channel';
import { getStates } from '../util/effectUtils';
import {
  DEFAULT_EFFECT_COLOR,
  DEFAULT_EFFECT_COLOR_ALT,
} from '../util/styleUtils';

import IconPanTilt from '../icons/IconPanTilt';
import IconRgb from '../icons/IconRgb';
import { randomUint64 } from '../util/numberUtils';
import { Button, IconButton } from './Button';
import { EffectState } from './EffectState';
import { NumberInput, ToggleInput } from './Input';
import { Modal } from './Modal';
import { SequenceEditor } from './SequenceEditor';
import { Spacer } from './Spacer';
import styles from './TimecodeEffect.module.scss';

interface TimecodeEffectProps {
  className: string;
  style: CSSProperties;
  timecodeEffect: TimecodeEffectProto;
  selectedEffect: TimecodeEffectProto | null;
  setSelectedEffect: () => void;
  copyEffect: TimecodeEffectProto | null;
  minMs: number;
  maxMs: number;
  pxToMs: (px: number) => number;
  snapToBeat: (t: number) => number;
}

export function TimecodeEffect({
  className,
  style: originalStyle,
  timecodeEffect,
  selectedEffect,
  setSelectedEffect,
  copyEffect,
  minMs,
  maxMs,
  pxToMs,
  snapToBeat,
}: TimecodeEffectProps): JSX.Element {
  const { palette } = useContext(PaletteContext);
  const { save, update } = useContext(ProjectContext);
  const { beatWidthPx, msWidthToPxWidth } = useContext(EffectRenderingContext);
  const { setShortcuts } = useContext(ShortcutContext);
  const [dragStart, setDragStart] = useState(false);
  const [dragEnd, setDragEnd] = useState(false);
  const [drag, setDrag] = useState<{
    offsetMs: number;
    widthMs: number;
  } | null>(null);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    if (copyEffect && timecodeEffect === selectedEffect) {
      return setShortcuts([
        {
          shortcut: { key: 'KeyV', modifiers: ['ctrl'] },
          action: () => {
            Object.assign(
              timecodeEffect,
              clone(TimecodedEffectSchema, copyEffect),
              {
                endMs: timecodeEffect.endMs,
                startMs: timecodeEffect.startMs,
              },
            );
            save('Paste effect.');
          },
          description: 'Paste effect from clipboard onto selected effect.',
        },
      ]);
    }
    return undefined;
  }, [copyEffect, timecodeEffect, selectedEffect, save]);

  if (!timecodeEffect.effect?.effect) {
    throw new Error('Timecode effect does not have effect!');
  }
  const effect = timecodeEffect.effect.effect;

  // React makes the original style immutable so we clone it to modify it.
  const style = Object.assign({}, originalStyle);
  const icons: Set<(props: any) => React.ReactNode> = new Set();
  switch (effect.case) {
    case 'staticEffect':
      if (effect.value.state) {
        style.background = effectColor(effect.value.state, palette);
        effectIcons(effect.value.state).forEach((i) => icons.add(i));
      }
      break;
    case 'rampEffect':
      const rampEffect = effect.value;
      if (rampEffect.stateStart != null && rampEffect.stateEnd) {
        const start = effectColor(rampEffect.stateStart, palette);
        const end = effectColor(rampEffect.stateEnd, palette, true);
        let width: number;
        if (rampEffect.timingMode?.timing.case === 'beat') {
          width =
            beatWidthPx / (rampEffect.timingMode.timing.value.multiplier || 1);
        } else if (rampEffect.timingMode?.timing.case === 'absolute') {
          width = msWidthToPxWidth(rampEffect.timingMode.timing.value.duration);
        } else {
          width = msWidthToPxWidth(
            timecodeEffect.endMs - timecodeEffect.startMs,
          );
        }
        if (rampEffect.timingMode?.mirrored) {
          style.background = `repeating-linear-gradient(90deg, ${end} 0, ${start} ${width}px, ${end} ${width * 2}px)`;
        } else {
          style.background = `repeating-linear-gradient(90deg, ${start} 0, ${end} ${width}px)`;
        }

        effectIcons(rampEffect.stateStart).forEach((i) => icons.add(i));
        effectIcons(rampEffect.stateEnd).forEach((i) => icons.add(i));
      }
      break;
    case 'strobeEffect':
      if (effect.value.stateA != null && effect.value.stateB != null) {
        const start = effectColor(effect.value.stateA, palette);
        const end = effectColor(effect.value.stateB, palette, true);
        const aWidth = effect.value.stateAFames * 2;
        const bWidth = effect.value.stateBFames * 2;
        style.background = `repeating-linear-gradient(-45deg, ${start} 0, ${start} ${aWidth}px, ${end} ${aWidth}px, ${end} ${aWidth + bWidth}px)`;

        effectIcons(effect.value.stateA).forEach((i) => icons.add(i));
        effectIcons(effect.value.stateB).forEach((i) => icons.add(i));
        break;
      }
  }

  const containerClasses = [styles.effect, className];
  if (timecodeEffect === selectedEffect) {
    containerClasses.push(styles.selected);
  }

  const maskCursor = dragStart || dragEnd ? 'ew-resize' : 'grabbing';

  return (
    <div
      className={containerClasses.join(' ')}
      style={style}
      onMouseDown={(e) => {
        setChanged(false);
        setSelectedEffect();
        setDrag({
          offsetMs: pxToMs(e.clientX) - timecodeEffect.startMs,
          widthMs: timecodeEffect.endMs - timecodeEffect.startMs,
        });
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {(dragStart || dragEnd || drag != null) && (
        <div
          className={styles.dragMask}
          style={{ cursor: maskCursor }}
          onMouseMove={(e) => {
            const ms = pxToMs(e.clientX);
            if (dragStart) {
              timecodeEffect.startMs = Math.min(
                Math.max(snapToBeat(ms), minMs),
                timecodeEffect.endMs - 1,
              );
            } else if (dragEnd) {
              timecodeEffect.endMs = Math.max(
                Math.min(snapToBeat(ms), maxMs),
                timecodeEffect.startMs + 1,
              );
            } else if (drag != null) {
              const startMs = snapToBeat(ms - drag.offsetMs);
              const endMs = startMs + drag.widthMs;
              if (startMs < minMs) {
                timecodeEffect.startMs = minMs;
                timecodeEffect.endMs = minMs + drag.widthMs;
              } else if (endMs > maxMs) {
                timecodeEffect.endMs = maxMs;
                timecodeEffect.startMs = maxMs - drag.widthMs;
              } else {
                timecodeEffect.startMs = startMs;
                timecodeEffect.endMs = endMs;
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
              save('Change effect timing.');
            }
            e.preventDefault();
            e.stopPropagation();
          }}
        ></div>
      )}
      <div className={styles.inner}>
        <div
          className={styles.icons}
          style={{ left: Math.max(0, -(style.left || 0)) }}
        >
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
        }}
      ></div>
      <div
        className={styles.dragEnd}
        onMouseDown={(e) => {
          setDragEnd(true);
          e.preventDefault();
          e.stopPropagation();
        }}
      ></div>
    </div>
  );
}

interface EffectDetailsBaseProps<T> {
  className?: string;
  effect: T;
  availableChannels: ChannelTypes[];
  showPhase: boolean;
}

export function EffectDetails({
  className,
  effect,
  availableChannels,
  showPhase,
}: EffectDetailsBaseProps<Effect>): JSX.Element {
  const { save } = useContext(ProjectContext);

  const classes = [styles.effectDetails, className];

  let details: JSX.Element;

  switch (effect.effect.case) {
    case 'staticEffect':
      details = (
        <StaticEffectDetails
          effect={effect.effect.value}
          availableChannels={availableChannels}
          showPhase={false}
        />
      );
      break;
    case 'rampEffect':
      details = (
        <RampEffectDetails
          effect={effect.effect.value}
          availableChannels={availableChannels}
          showPhase={showPhase}
        />
      );
      break;
    case 'strobeEffect':
      details = (
        <StrobeEffectDetails
          effect={effect.effect.value}
          availableChannels={availableChannels}
          showPhase={false}
        />
      );
      break;
    case 'randomEffect':
      details = (
        <RandomEffectDetails
          effect={effect.effect.value}
          availableChannels={availableChannels}
          showPhase={false}
        />
      );
      break;
    case 'sequenceEffect':
      details = (
        <SequenceEffectDetails
          effect={effect.effect.value}
          availableChannels={availableChannels}
          showPhase={showPhase}
        />
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
        <Spacer />
        <EffectSelector
          effect={effect.effect}
          setEffect={(e, description) => {
            effect.effect = e;
            save(description);
          }}
          showRandom={true}
        />
      </div>
      <hr />
      {details}
    </div>
  );
}

function effectColor(
  state: FixtureState,
  palette: ColorPalette,
  alt = false,
): string {
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
          throw new Error(
            'Tried to fetch primary color from undefined palette!',
          );
        }
        if (palette.primary.color == null) {
          throw new Error('Primary color does not have a "color" field!');
        }
        color = palette.primary.color;
        break;
      case PaletteColor.PALETTE_SECONDARY:
        if (palette.secondary == null) {
          throw new Error(
            'Tried to fetch secondary color from undefined palette!',
          );
        }
        if (palette.secondary.color == null) {
          throw new Error('Primary color does not have a "color" field!');
        }
        color = palette.secondary.color;
        break;
      case PaletteColor.PALETTE_TERTIARY:
        if (palette.tertiary == null) {
          throw new Error(
            'Tried to fetch tertiary color from undefined palette!',
          );
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

function effectIcons(
  effect: FixtureStateProto,
): Array<(props: any) => React.ReactNode> {
  const icons: Array<(props: any) => React.ReactNode> = [];
  if (effect.lightColor.case === 'color') {
    icons.push(IconRgb);
  } else if (effect.lightColor.case === 'paletteColor') {
    icons.push(BiPalette);
  }
  if (effect?.dimmer != null) {
    icons.push(BiSun);
  }
  if (effect?.pan != null || effect?.tilt != null) {
    icons.push(IconPanTilt);
  }
  if (effect?.height != null || effect?.width != null) {
    icons.push(BiMove);
  }
  if (effect?.zoom != null) {
    icons.push(BiSolidBinoculars);
  }
  if (effect?.speed != null) {
    icons.push(MdSpeed);
  }
  if (effect?.strobe) {
    icons.push(BiSolidBolt);
  }
  return icons;
}

function StaticEffectDetails({
  effect,
  availableChannels,
}: EffectDetailsBaseProps<Effect_StaticEffect>): JSX.Element {
  if (effect.state == null) {
    throw new Error('Static effect does not have a state!');
  }

  return (
    <>
      <EffectState
        states={[
          {
            name: 'Effect',
            state: effect.state,
          },
        ]}
        availableChannels={availableChannels}
      />
    </>
  );
}

function RampEffectDetails({
  effect,
  availableChannels,
  showPhase,
}: EffectDetailsBaseProps<Effect_RampEffect>): JSX.Element {
  if (effect.stateStart == null || effect.stateEnd == null) {
    throw new Error('Ramp effect does not have a state!');
  }

  return (
    <>
      <EffectTimingDetails effect={effect} showPhase={showPhase} />

      <hr />
      <EffectState
        states={[
          {
            name: 'Start',
            state: effect.stateStart,
          },
          { name: 'End', state: effect.stateEnd },
        ]}
        availableChannels={availableChannels}
      />
    </>
  );
}

function StrobeEffectDetails({
  effect,
  availableChannels,
}: EffectDetailsBaseProps<Effect_StrobeEffect>): JSX.Element {
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
          }}
        />
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
          }}
        />
      </label>
      <hr />
      <EffectState
        states={[
          { name: 'State A', state: effect.stateA },
          { name: 'State B', state: effect.stateB },
        ]}
        availableChannels={availableChannels}
      />
    </>
  );
}

function RandomEffectDetails({
  effect,
  availableChannels,
}: EffectDetailsBaseProps<Effect_RandomEffect>): JSX.Element {
  const { save } = useContext(ProjectContext);

  return (
    <>
      <label>
        <span>Effect A min (Seconds)</span>
        <NumberInput
          title="speed"
          type="float"
          min={0}
          max={500}
          value={effect.effectAMin / 1000}
          onChange={(value) => {
            const ms = Math.floor(value * 1000);
            effect.effectAMin = ms;
            save(`Change random effect A min seconds to ${value}.`);
          }}
        />
      </label>
      <label>
        <span>Effect A max (Seconds)</span>
        <NumberInput
          title="speed"
          type="float"
          min={effect.effectAMin / 1000}
          max={500}
          value={(effect.effectAMin + effect.effectAVariation) / 1000}
          onChange={(value) => {
            effect.effectAVariation =
              Math.floor(value * 1000) - effect.effectAMin;
            save(`Change random effect A max seconds to ${value}.`);
          }}
        />
      </label>

      <label>
        <span>Effect B min (Seconds)</span>
        <NumberInput
          title="speed"
          type="float"
          min={0}
          max={500}
          value={effect.effectBMin / 1000}
          onChange={(value) => {
            const ms = Math.floor(value * 1000);
            effect.effectBMin = ms;
            save(`Change random effect A min seconds to ${value}.`);
          }}
        />
      </label>
      <label>
        <span>Effect B max (Seconds)</span>
        <NumberInput
          title="speed"
          type="float"
          min={effect.effectBMin / 1000}
          max={500}
          value={(effect.effectBMin + effect.effectBVariation) / 1000}
          onChange={(value) => {
            effect.effectBVariation =
              Math.floor(value * 1000) - effect.effectBMin;
            save(`Change random effect A max seconds to ${value}.`);
          }}
        />
      </label>

      <label>
        <span>Independent Fixtures</span>
        <ToggleInput
          value={effect.treatFixturesIndividually}
          onChange={(value) => {
            effect.treatFixturesIndividually = value;
            save(
              `Change random effect to ${value ? '' : 'not '}treat fixtures independently.`,
            );
          }}
        />
      </label>

      <label>
        <span>Random Seed</span>
        <NumberInput
          title="speed"
          type="integer"
          min={0}
          max={4_294_967_295}
          value={effect.seed}
          onChange={(value) => {
            effect.seed = value;
            save(`Change random effect seed to ${value}.`);
          }}
        />
      </label>

      <hr />
      <h2>Effect A</h2>
      <div className={styles.effectType}>
        <span>Effect type</span>
        <Spacer />
        <EffectSelector
          effect={effect.effectA!.effect}
          setEffect={(e, description) => {
            effect.effectA = create(EffectSchema, { effect: e });
            save(description);
          }}
        />
      </div>
      <RandomEffectSubDetails
        effect={effect.effectA}
        availableChannels={availableChannels}
      />
      <hr />
      <h2>Effect B</h2>
      <div className={styles.effectType}>
        <span>Effect B type</span>
        <Spacer />
        <EffectSelector
          effect={effect.effectB!.effect}
          setEffect={(e, description) => {
            effect.effectB = create(EffectSchema, { effect: e });
            save(description);
          }}
        />
      </div>
      <RandomEffectSubDetails
        effect={effect.effectB}
        availableChannels={availableChannels}
      />
    </>
  );
}

function SequenceEffectDetails({
  effect,
  showPhase,
}: EffectDetailsBaseProps<Effect_SequenceEffect>): JSX.Element {
  const { project, save } = useContext(ProjectContext);
  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <>
      <EffectTimingDetails effect={effect} showPhase={showPhase} />
      <hr />
      <select
        value={String(effect.sequenceId)}
        onChange={(e) => {
          if (e.target.value === 'new') {
            const id = randomUint64();
            project.sequences[String(id)] = create(SequenceSchema, {
              name: 'New sequence',
              nativeBeats: 1,
              layers: [
                {
                  effects: [],
                },
              ],
            });
            effect.sequenceId = id;
            save('Create new sequence.');
            setEditorOpen(true);
            return;
          }
          const sequenceId = BigInt(e.target.value);
          effect.sequenceId = sequenceId;
          const sequence = project.sequences[String(sequenceId)];
          save(`Set tile effect sequence to ${sequence.name}.`);
        }}
      >
        <option value="0">&lt;unset&gt;</option>
        {Object.entries(project.sequences)
          .sort(([_a, a], [_b, b]) => a.name.localeCompare(b.name))
          .map(([id, { name }]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        <option value="new">+ New sequence</option>
      </select>
      <Button
        onClick={() => setEditorOpen(true)}
        disabled={effect.sequenceId === 0n}
      >
        Edit Sequence
      </Button>
      {editorOpen && (
        <Modal
          title={`Edit Sequence '${project.sequences[String(effect.sequenceId)].name}'`}
          onClose={() => setEditorOpen(false)}
          fullScreen={true}
        >
          <SequenceEditor
            className={styles.sequenceEditor}
            sequenceId={effect.sequenceId}
          />
        </Modal>
      )}
    </>
  );
}

interface EffectSelectorProps {
  effect: Effect['effect'];
  setEffect: (effect: Effect['effect'], description: string) => void;
  showRandom?: boolean;
}

function EffectSelector({
  effect,
  setEffect,
  showRandom,
}: EffectSelectorProps) {
  return (
    <>
      <IconButton
        title="Static Effect"
        variant={effect.case === 'staticEffect' ? 'primary' : 'default'}
        onClick={() => {
          if (effect.case === 'staticEffect') {
            return;
          }

          setEffect(
            {
              case: 'staticEffect',
              value: create(Effect_StaticEffectSchema, {
                state: clone(FixtureStateSchema, getStates(effect.value).a),
              }),
            },
            'Change effect type to static.',
          );
        }}
      >
        <BiPause />
      </IconButton>
      <IconButton
        title="Ramp Effect"
        variant={effect.case === 'rampEffect' ? 'primary' : 'default'}
        onClick={() => {
          if (effect.case === 'rampEffect') {
            return;
          }

          setEffect(
            {
              case: 'rampEffect',
              value: create(Effect_RampEffectSchema, {
                stateStart: clone(
                  FixtureStateSchema,
                  getStates(effect.value).a,
                ),
                stateEnd: clone(FixtureStateSchema, getStates(effect.value).b),
                timingMode: {
                  timing: {
                    case: 'beat',
                    value: {
                      multiplier: 1,
                    },
                  },
                  easing: EffectTiming_EasingFunction.LINEAR,
                  mirrored: false,
                  phase: 0,
                },
              }),
            },
            'Change effect type to ramp.',
          );
        }}
      >
        <BiLineChart />
      </IconButton>
      <IconButton
        title="Strobe Effect"
        variant={effect.case === 'strobeEffect' ? 'primary' : 'default'}
        onClick={() => {
          if (effect.case === 'strobeEffect') {
            return;
          }

          setEffect(
            {
              case: 'strobeEffect',
              value: create(Effect_StrobeEffectSchema, {
                stateA: clone(FixtureStateSchema, getStates(effect.value).a),
                stateB: clone(FixtureStateSchema, getStates(effect.value).b),
                stateAFames: 3,
                stateBFames: 3,
              }),
            },
            'Change effect type to strobe.',
          );
        }}
      >
        <BiSolidBolt />
      </IconButton>
      {showRandom && (
        <IconButton
          title="Random Effect"
          variant={effect.case === 'randomEffect' ? 'primary' : 'default'}
          onClick={() => {
            if (effect.case === 'randomEffect') {
              return;
            }

            setEffect(
              {
                case: 'randomEffect',
                value: create(Effect_RandomEffectSchema, {
                  seed: 0,
                  effectAMin: 0,
                  effectAVariation: 1000,
                  effectBMin: 0,
                  effectBVariation: 1000,

                  effectA: {
                    effect: {
                      case: 'staticEffect',
                      value: create(Effect_StaticEffectSchema, {
                        state: clone(
                          FixtureStateSchema,
                          getStates(effect.value).a,
                        ),
                      }),
                    },
                  },

                  effectB: {
                    effect: {
                      case: 'staticEffect',
                      value: create(Effect_StaticEffectSchema, {
                        state: clone(
                          FixtureStateSchema,
                          getStates(effect.value).a,
                        ),
                      }),
                    },
                  },
                }),
              },
              'Change effect type to random.',
            );
          }}
        >
          <BiDice6 />
        </IconButton>
      )}
      <IconButton
        title="Sequence Effect"
        variant={effect.case === 'sequenceEffect' ? 'primary' : 'default'}
        onClick={() => {
          if (effect.case === 'sequenceEffect') {
            return;
          }

          setEffect(
            {
              case: 'sequenceEffect',
              value: create(Effect_SequenceEffectSchema, {
                sequenceId: 0n,
                timingMode: {
                  timing: {
                    case: 'beat',
                    value: {
                      multiplier: 1,
                    },
                  },
                  easing: EffectTiming_EasingFunction.LINEAR,
                  mirrored: false,
                  phase: 0,
                },
              }),
            },
            'Change effect type to sequence.',
          );
        }}
      >
        <LuChartBarStacked />
      </IconButton>
    </>
  );
}

interface EffectTimingDetailsProps {
  effect: Effect_RampEffect | Effect_SequenceEffect;
  showPhase: boolean;
}

function EffectTimingDetails({ effect, showPhase }: EffectTimingDetailsProps) {
  const { save } = useContext(ProjectContext);

  return (
    <>
      <label>
        <span>Easing</span>
        <select
          value={effect.timingMode?.easing}
          onChange={(e) => {
            effect.timingMode!.easing = parseInt(e.target.value);
            save('Change effect easing type.');
          }}
        >
          <option value={EffectTiming_EasingFunction.LINEAR}>Linear</option>
          <option value={EffectTiming_EasingFunction.EASE_IN}>Ease in</option>
          <option value={EffectTiming_EasingFunction.EASE_OUT}>Ease out</option>
          <option value={EffectTiming_EasingFunction.EASE_IN_OUT}>
            Ease in/out
          </option>
          <option value={EffectTiming_EasingFunction.SINE}>Sine</option>
        </select>
      </label>
      <label>
        <span>Timing mode</span>
        <select
          value={effect.timingMode?.timing.case}
          onChange={(e) => {
            const currentCase = effect.timingMode?.timing.case;
            const newTiming = e.target.value;
            if (currentCase === newTiming) {
              return;
            }

            switch (newTiming) {
              case 'absolute':
                effect.timingMode!.timing = {
                  case: 'absolute',
                  value: create(EffectTiming_AbsoluteSchema, {
                    duration: 1000,
                  }),
                };
                break;
              case 'beat':
                effect.timingMode!.timing = {
                  case: 'beat',
                  value: create(EffectTiming_BeatSchema, {
                    multiplier: 1,
                  }),
                };
                break;
              case 'oneShot':
                effect.timingMode!.timing = {
                  case: 'oneShot',
                  value: create(EffectTiming_OneShotSchema, {}),
                };
                break;
            }

            save(`Change effect timing to ${newTiming}.`);
          }}
        >
          <option value={'absolute'}>Absolute</option>
          <option value={'beat'}>Beat</option>
          <option value={'oneShot'}>One Shot</option>
        </select>
      </label>

      {effect.timingMode?.timing.case === 'absolute' && (
        <label>
          <span>Duration (seconds)</span>
          <NumberInput
            type="float"
            max={300}
            min={0}
            value={effect.timingMode.timing.value.duration / 1_000}
            onChange={(v) => {
              if (effect.timingMode?.timing.case !== 'absolute') {
                throw new Error('Expected absolute timing mode!');
              }
              effect.timingMode.timing.value.duration = Math.floor(v * 1_000);
              save(`Change effect duration to ${v} seconds.`);
            }}
          />
        </label>
      )}

      {effect.timingMode?.timing.case === 'beat' && (
        <label>
          <span>Beats</span>
          <NumberInput
            type="float"
            max={64}
            min={0}
            value={effect.timingMode.timing.value.multiplier}
            onChange={(v) => {
              if (effect.timingMode?.timing.case !== 'beat') {
                throw new Error('Expected absolute timing mode!');
              }
              effect.timingMode.timing.value.multiplier = v;
              save(`Change effect duration to ${v} beats.`);
            }}
          />
        </label>
      )}

      <label>
        <span>Mirrored</span>
        <Button
          variant={effect.timingMode?.mirrored ? 'primary' : 'default'}
          onClick={() => {
            effect.timingMode!.mirrored = !effect.timingMode!.mirrored;
            save(
              `Changed effect mirrored status to ${effect.timingMode!.mirrored}.`,
            );
          }}
        >
          Mirrored
        </Button>
      </label>

      {showPhase && (
        <label>
          <span>Phase</span>
          <NumberInput
            type="float"
            max={256}
            min={-256}
            value={effect.timingMode!.phase || 0}
            onChange={(v) => {
              effect.timingMode!.phase = v;
              save(`Change effect phase to ${v}.`);
            }}
          />
        </label>
      )}
    </>
  );
}

interface RandomEffectSubDetailsProps {
  effect: Effect_RandomEffect['effectA'] | Effect_RandomEffect['effectB'];
  availableChannels: ChannelTypes[];
}

function RandomEffectSubDetails({
  effect,
  availableChannels,
}: RandomEffectSubDetailsProps) {
  switch (effect?.effect.case) {
    case 'staticEffect':
      return (
        <StaticEffectDetails
          effect={effect.effect.value}
          availableChannels={availableChannels}
          showPhase={false}
        />
      );
    case 'rampEffect':
      return (
        <RampEffectDetails
          effect={effect.effect.value}
          availableChannels={availableChannels}
          showPhase={false}
        />
      );
    case 'strobeEffect':
      return (
        <StrobeEffectDetails
          effect={effect.effect.value}
          availableChannels={availableChannels}
          showPhase={false}
        />
      );
    default:
      return 'Not Set';
  }
}
