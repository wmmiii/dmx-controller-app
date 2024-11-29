import React, { useCallback } from 'react';
import ColorPicker from 'react-pick-color';
import IconBxPlus from '../icons/IconBxPlus';
import IconBxX from '../icons/IconBxX';
import RangeInput from './RangeInput';
import styles from './EffectState.module.scss';
import { Button, IconButton } from './Button';
import { FixtureState as FixtureStateProto, FixtureState_Channel, RGB, RGBW } from "@dmx-controller/proto/effect_pb";
import { NumberInput } from './Input';

interface EffectStateProps {
  state: FixtureStateProto;
  onChange: (state: FixtureStateProto) => void;
}

export function EffectState(
  { state, onChange }: EffectStateProps):
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
  }, [state, onChange]);

  return (
    <>
      <label>
        <span>Color mode</span>
        <select
          value={state.color.case}
          onChange={(e) => onColorTypeChange(e.target.value)}>
          <option value="none">None</option>
          <option value="rgb">RGB</option>
          <option value="rgbw">RGBW</option>
        </select>
      </label>
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
      {
        state.color.case === 'rgbw' &&
        <label className={styles.stateRow}>
          <span>White</span>
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
            <span>Brightness</span>
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
            <span>Brightness</span>
            <IconButton
              title="Add Brightness"
              onClick={() => {
                state.brightness = 1;
                onChange(state);
              }}>
              <IconBxPlus />
            </IconButton>
          </label>
      }
      {
        state.strobe != null ?
          <label className={styles.stateRow}>
            <span>Strobe</span>
            <NumberInput
              type="float"
              max={1}
              min={0}
              value={state.strobe}
              onChange={(v) => {
                state.strobe = v;
                onChange(state);
              }} />&nbsp;
            <IconButton
              title="Remove Strobe"
              onClick={() => {
                state.strobe = undefined;
                onChange(state);
              }}>
              <IconBxX />
            </IconButton>
          </label> :
          <label className={styles.stateRow}>
            <span>Strobe</span>
            <IconButton
              title="Add Strobe"
              onClick={() => {
                state.strobe = 0;
                onChange(state);
              }}>
              <IconBxPlus />
            </IconButton>
          </label>
      }
      {
        state.pan != null ?
          <label className={styles.stateRow}>
            <span>Pan</span>
            <NumberInput
              type="float"
              max={720}
              min={-720}
              value={state.pan}
              onChange={(v) => {
                state.pan = v;
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
            <span>Pan</span>
            <IconButton
              title="Add Pan"
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
            <span>Tilt</span>
            <NumberInput
              type="float"
              max={720}
              min={-720}
              value={state.tilt}
              onChange={(v) => {
                state.tilt = v;
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
            <span>Tilt</span>
            <IconButton
              title="Add Tilt"
              onClick={() => {
                state.tilt = 0;
                onChange(state);
              }}>
              <IconBxPlus />
            </IconButton>
          </label>
      }
      {
        state.zoom != null ?
          <label className={styles.stateRow}>
            <span>Zoom</span>
            <NumberInput
              type="float"
              max={1}
              min={0}
              value={state.zoom}
              onChange={(v) => {
                state.zoom = v;
                onChange(state);
              }} />&nbsp;
            <IconButton
              title="Remove Zoom"
              onClick={() => {
                state.zoom = undefined;
                onChange(state);
              }}>
              <IconBxX />
            </IconButton>
          </label> :
          <label className={styles.stateRow}>
            <span>Zoom</span>
            <IconButton
              title="Add Zoom"
              onClick={() => {
                state.zoom = 0;
                onChange(state);
              }}>
              <IconBxPlus />
            </IconButton>
          </label>
      }
      <label>Channels:</label>
      {
        state.channels.map((c: FixtureState_Channel, i: number) => (
          <div key={i} className={styles.stateRow}>
            <NumberInput
              className={styles.input}
              title="index"
              value={c.index + 1}
              onChange={(v) => {
                c.index = v - 1;
                onChange(state);
              }}
              min={1}
              max={512} />
            <NumberInput
              className={styles.input}
              title="value"
              value={c.value}
              onChange={(v) => {
                c.value = v;
                onChange(state);
              }}
              min={0}
              max={255} />
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
      <Button onClick={() => {
        state.channels.push(new FixtureState_Channel({
          index: 0,
          value: 0,
        }));
        onChange(state);
      }}>
        Add custom channel
      </Button>
    </>
  );
}
