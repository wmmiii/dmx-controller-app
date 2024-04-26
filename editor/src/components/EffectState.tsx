import React, { useCallback, useContext } from 'react';
import ColorPicker from 'react-pick-color';
import IconBxPlus from '../icons/IconBxPlus';
import IconBxX from '../icons/IconBxX';
import RangeInput from './RangeInput';
import styles from './EffectState.module.scss';
import { Button, IconButton } from './Button';
import { ProjectContext } from '../contexts/ProjectContext';
import { SequenceMapping as SequenceMappingProto, FixtureState as FixtureStateProto, FixtureState_Channel, RGB, RGBW, EffectTiming } from "@dmx-controller/proto/effect_pb";
import { isFixtureState } from '../engine/effectUtils';
import { sequences } from '../engine/sequenceUtils';

interface EffectStateProps {
  // Only needs to be set if this effect is part of a sequence.
  sequenceId?: number;
  effect: FixtureStateProto | SequenceMappingProto;
  onChange: (effect: FixtureStateProto | SequenceMappingProto) => void;
}

export default function EffectState({ sequenceId, effect, onChange }: EffectStateProps):
  JSX.Element {
  let details: JSX.Element;
  if (isFixtureState(effect)) {
    details = <FixtureState state={effect} onChange={onChange} />;
  } else {
    details = <SequenceMapping
      sequenceId={sequenceId}
      sequence={effect}
      onChange={onChange} />;
  }
  return (
    <>
      <label>
        <select
          value={String(isFixtureState(effect))}
          onChange={(e) => {
            if (e.target.value === 'true') {
              onChange(new FixtureStateProto({}));
            } else {
              onChange(new SequenceMappingProto({
                sequenceId: 0,
                timingMode: EffectTiming.BEAT,
                offsetBeat: 0,
                timingMultiplier: 1,
              }));
            }
          }}>
          <option value="true">Fixture State</option>
          <option value="false">Sequence</option>
        </select>
      </label>
      {details}
    </>
  );
}

interface FixtureStateProps {
  state: FixtureStateProto;
  onChange: (state: FixtureStateProto) => void;
}

function FixtureState(
  { state, onChange }: FixtureStateProps):
  JSX.Element {

  const onColorTypeChange = useCallback((type: string) => {
    if (type === 'none') {
      state.color.case = undefined;
      state.color.value = undefined;
      onChange(state);
      return;
    }
    const r = state.color.value?.red || 0;
    const g = state.color.value?.green || 0;
    const b = state.color.value?.blue || 0;
    const w = (state.color.value as RGBW)?.white || 0;
    if (type === 'rgb') {
      state.color = {
        case: 'rgb',
        value: new RGB({
          red: r,
          green: g,
          blue: b,
        }),
      };
    } else if (type === 'rgbw') {
      state.color = {
        case: 'rgbw',
        value: new RGBW({
          red: r,
          green: g,
          blue: b,
          white: w,
        }),
      };
    } else {
      throw Error('Unrecognized color profile: ' + type);
    }
    onChange(state);
  }, [state]);

  return (
    <>
      <label>
        Color mode:&nbsp;
        <select
          value={state.color.case}
          onChange={(e) => onColorTypeChange(e.target.value)}>
          <option value="none">None</option>
          <option value="rgb">RGB</option>
          <option value="rgbw">RGBW</option>
        </select>
        {
          state.color.case &&
          <ColorPicker
            hideAlpha={true}
            color={{
              r: state.color.value.red * 255,
              g: state.color.value.green * 255,
              b: state.color.value.blue * 255,
              a: 1,
            }}
            onChange={({ rgb }) => {
              state.color.value.red = rgb.r / 255;
              state.color.value.green = rgb.g / 255;
              state.color.value.blue = rgb.b / 255;
              onChange(state);
            }}
            theme={{
              background: 'transparent',
              borderColor: 'none',
              width: '100%',
            }} />
        }
      </label>
      {
        state.color.case === 'rgbw' &&
        <label className={styles.stateRow}>
          White:&nbsp;
          <RangeInput
            className={styles.input}
            max="255"
            value={state.color.value.white * 255}
            onChange={(v) => {
              state.color.value.white = v / 255;
              onChange(state);
            }} />
        </label>
      }
      {
        state.brightness != null ?
          <label className={styles.stateRow}>
            Brightness:&nbsp;
            <RangeInput
              className={styles.input}
              max="1"
              value={state.brightness}
              onChange={(v) => {
                state.brightness = v;
                onChange(state);
              }} />&nbsp;
            <IconButton
              title="Remove Brightness"
              onClick={() => {
                state.brightness = undefined;
                onChange(state);
              }}>
              <IconBxX />
            </IconButton>
          </label> :
          <label className={styles.stateRow}>
            Brightness&nbsp;
            <IconButton
              title="Remove Brightness"
              onClick={() => {
                state.brightness = 1;
                onChange(state);
              }}>
              <IconBxPlus />
            </IconButton>
          </label>
      }
      {
        state.pan != null ?
          <label className={styles.stateRow}>
            Pan:&nbsp;
            <input
              type="number"
              max="720"
              min="-720"
              value={state.pan}
              onChange={(e) => {
                state.pan = parseFloat(e.target.value);
                onChange(state);
              }} />&nbsp;
            <IconButton
              title="Remove Pan"
              onClick={() => {
                state.pan = undefined;
                onChange(state);
              }}>
              <IconBxX />
            </IconButton>
          </label> :
          <label className={styles.stateRow}>
            Pan&nbsp;
            <IconButton
              title="Remove Pan"
              onClick={() => {
                state.pan = 0;
                onChange(state);
              }}>
              <IconBxPlus />
            </IconButton>
          </label>
      }
      {
        state.tilt != null ?
          <label className={styles.stateRow}>
            Tilt:&nbsp;
            <input
              type="number"
              max="720"
              min="-720"
              value={state.tilt}
              onChange={(e) => {
                state.tilt = parseFloat(e.target.value);
                onChange(state);
              }} />&nbsp;
            <IconButton
              title="Remove Tilt"
              onClick={() => {
                state.tilt = undefined;
                onChange(state);
              }}>
              <IconBxX />
            </IconButton>
          </label> :
          <label className={styles.stateRow}>
            Tilt&nbsp;
            <IconButton
              title="Remove Tilt"
              onClick={() => {
                state.tilt = 0;
                onChange(state);
              }}>
              <IconBxPlus />
            </IconButton>
          </label>
      }
      <label>Channels:</label>
      {
        state.channels.map((c: FixtureState_Channel, i: number) => (
          <div className={styles.stateRow}>
            <input
              className={styles.input}
              title="index"
              type="number"
              value={c.index}
              onChange={(e) => {
                c.index = parseInt(e.target.value);
                onChange(state);
              }}
              min="0"
              max="512"
              step="1" />
            <input
              className={styles.input}
              title="value"
              type="number"
              value={c.value}
              onChange={(e) => {
                c.value = parseInt(e.target.value);
                onChange(state);
              }}
              min="0"
              max="512"
              step="1" />
            <IconButton
              title="Remove Channel"
              onClick={() => {
                state.channels.splice(i, 1);
                onChange(state);
              }}>
              <IconBxX />
            </IconButton>
          </div>
        ))
      }
      <Button onClick={() => state.channels.push(new FixtureState_Channel({
        index: 0,
        value: 0,
      }))}>
        Add custom channel
      </Button>
    </>
  );
}

interface SequenceMappingProps {
  sequenceId?: number;
  sequence: SequenceMappingProto;
  onChange: (sequence: SequenceMappingProto) => void;
}

function SequenceMapping({ sequenceId, sequence, onChange }: SequenceMappingProps): JSX.Element {
  const { project } = useContext(ProjectContext);

  return (
    <>
      <label>
        Sequence:&nbsp;
        <select
          value={sequence.sequenceId}
          onChange={(e) => {
            sequence.sequenceId = parseInt(e.target.value);
            onChange(sequence);
          }}>
          <option value={0}>&lt;Unset&gt;</option>
          {
            Object.entries(sequences(project, sequenceId))
              .map(([key, value]) => (
                <option value={key}>{value.name}</option>
              ))
          }
        </select>
      </label>
    </>
  );
}
