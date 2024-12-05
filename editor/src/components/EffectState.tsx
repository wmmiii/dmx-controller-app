import React, { useCallback } from 'react';
import ColorPicker from 'react-pick-color';
import IconBxPlus from '../icons/IconBxPlus';
import IconBxX from '../icons/IconBxX';
import RangeInput from './RangeInput';
import styles from './EffectState.module.scss';
import { Button, IconButton } from './Button';
import { FixtureState as FixtureStateProto, FixtureState_Channel, RGB, RGBW } from "@dmx-controller/proto/effect_pb";
import { NumberInput } from './Input';
import { Color, PaletteColor } from '@dmx-controller/proto/color_pb';

type ColorSelectorType = 'none' | 'color' | PaletteColor;

interface EffectStateProps {
  state: FixtureStateProto;
  onChange: (state: FixtureStateProto) => void;
}

export function EffectState(
  { state, onChange }: EffectStateProps):
  JSX.Element {

  const onColorTypeChange = useCallback((type: ColorSelectorType) => {
    if (type === 'none') {
      state.lightColor = {
        case: undefined,
        value: undefined,
      };
    } else if (type === 'color') {
      state.lightColor = {
        case: 'color',
        value: new Color({
          red: 1,
          green: 1,
          blue: 1,
          white: 0,
        }),
      };
    } else {
      state.lightColor = {
        case: 'paletteColor',
        value: parseInt(type as any),
      };
    }
    onChange(state);
  }, [state, onChange]);

  let colorType: ColorSelectorType;
  if (state.lightColor.case === undefined) {
    colorType = 'none';
  } else if (state.lightColor.case === 'color') {
    colorType = 'color';
  } else if (state.lightColor.case === 'paletteColor') {
    colorType = state.lightColor.value;
  } else {
    throw new Error(`Unrecognized light color type! ${state.lightColor}`);
  }

  return (
    <>
      <label>
        <span>Color mode</span>
        <select
          value={colorType}
          onChange={(e) => onColorTypeChange(e.target.value as ColorSelectorType)}>
          <option value="none">None</option>
          <option value="color">Custom Color</option>
          <option value={PaletteColor.PRIMARY}>Primary</option>
          <option value={PaletteColor.SECONDARY}>Secondary</option>
          <option value={PaletteColor.TERTIARY}>Tertiary</option>
          <option value={PaletteColor.WHITE}>White</option>
          <option value={PaletteColor.BLACK}>Black</option>
        </select>
      </label>
      {
        state.lightColor.case === 'color' &&
        <ColorPicker
          hideAlpha={true}
          color={{
            r: state.lightColor.value.red * 255,
            g: state.lightColor.value.green * 255,
            b: state.lightColor.value.blue * 255,
            a: 1,
          }}
          onChange={({ rgb }) => {
            if (state.lightColor.case === 'color') {
              state.lightColor.value.red = rgb.r / 255;
              state.lightColor.value.green = rgb.g / 255;
              state.lightColor.value.blue = rgb.b / 255;
            }
            onChange(state);
          }}
          theme={{
            background: 'transparent',
            borderColor: 'none',
            width: '100%',
          }} />
      }
      {
        state.lightColor.case === 'color' &&
        <RangeChannel
          name="White"
          value={state.lightColor.value.white}
          onChange={(v) => {
            if (state.lightColor.case === 'color') {
              state.lightColor.value.white = v;
              onChange(state);
            }
          }} />
      }
      <RangeChannel
        name="Brightness"
        value={state.brightness}
        onChange={(v) => {
          state.brightness = v;
          onChange(state);
        }} />
      <RangeChannel
        name="Strobe"
        value={state.strobe}
        onChange={(v) => {
          state.strobe = v;
          onChange(state);
        }} />
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
      <RangeChannel
        name="Width"
        value={state.width}
        onChange={(v) => {
          state.width = v;
          onChange(state);
        }} />
      <RangeChannel
        name="Height"
        value={state.height}
        onChange={(v) => {
          state.height = v;
          onChange(state);
        }} />
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

interface RangeChannelProps {
  name: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

function RangeChannel({ name, value, onChange }: RangeChannelProps) {
  return (
    <label className={styles.stateRow}>
      <span>{name}</span>
      {
        value != null ?
          <>
            <NumberInput
              type="float"
              max={1}
              min={0}
              value={value}
              onChange={onChange} />&nbsp;
            <IconButton
              title={`Remove ${name}`}
              onClick={() => onChange(undefined)}>
              <IconBxX />
            </IconButton>
          </> :
          <IconButton
            title="Add Strobe"
            onClick={() => onChange(0)}>
            <IconBxPlus />
          </IconButton>
      }
    </label>
  );
}
