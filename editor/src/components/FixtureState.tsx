import React, { useCallback } from 'react';
import { FixtureState as FixtureStateProto, RGB, RGBW } from "@dmx-controller/proto/effect_pb";
import ColorPicker from 'react-pick-color';
import { IconButton } from './Button';
import IconBxX from '../icons/IconBxX';
import RangeInput from './RangeInput';
import IconBxPlus from '../icons/IconBxPlus';

import styles from './FixtureState.module.scss';

interface FixtureStateProps {
  state: FixtureStateProto;
  onChange: (state: FixtureStateProto) => void;
}

export default function FixtureState(
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
            }}/>
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
            <IconButton onClick={() => {
              state.brightness = undefined;
              onChange(state);
            }}>
              <IconBxX />
            </IconButton>
          </label> :
          <label className={styles.stateRow}>
            Brightness&nbsp;
            <IconButton onClick={() => {
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
            <IconButton onClick={() => {
              state.pan = undefined;
              onChange(state);
            }}>
              <IconBxX />
            </IconButton>
          </label> :
          <label className={styles.stateRow}>
            Pan&nbsp;
            <IconButton onClick={() => {
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
            <IconButton onClick={() => {
              state.tilt = undefined;
              onChange(state);
            }}>
              <IconBxX />
            </IconButton>
          </label> :
          <label className={styles.stateRow}>
            Tilt&nbsp;
            <IconButton onClick={() => {
              state.tilt = 0;
              onChange(state);
            }}>
              <IconBxPlus />
            </IconButton>
          </label>
      }
    </>
  );
}
