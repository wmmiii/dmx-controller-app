import { create } from '@bufbuild/protobuf';
import { ColorSchema, PaletteColor } from '@dmx-controller/proto/color_pb';
import {
  FixtureState as FixtureStateProto,
  FixtureState_Channel,
  FixtureState_ChannelSchema,
} from '@dmx-controller/proto/effect_pb';
import { JSX, useCallback } from 'react';

import {
  AMOUNT_CHANNELS,
  ANGLE_CHANNELS,
  COLOR_CHANNELS,
  ChannelTypes,
} from '../engine/channel';
import IconBxPlus from '../icons/IconBxPlus';
import IconBxX from '../icons/IconBxX';

import { Button, IconButton } from './Button';
import { ColorSwatch } from './ColorSwatch';
import styles from './EffectState.module.scss';
import { NumberInput } from './Input';

type ColorSelectorType = 'none' | 'color' | PaletteColor;

interface EffectStateProps {
  state: FixtureStateProto;
  onChange: (state: FixtureStateProto) => void;
  availableChannels: ChannelTypes[];
}

export function EffectState({
  state,
  onChange,
  availableChannels,
}: EffectStateProps): JSX.Element {
  const onColorTypeChange = useCallback(
    (type: ColorSelectorType) => {
      if (type === 'none') {
        state.lightColor = {
          case: undefined,
          value: undefined,
        };
      } else if (type === 'color') {
        state.lightColor = {
          case: 'color',
          value: create(ColorSchema, {
            red: 1,
            green: 1,
            blue: 1,
            white: 0,
          }),
        };
      } else {
        state.lightColor = {
          case: 'paletteColor',
          value: parseInt(type.toString()),
        };
      }
      onChange(state);
    },
    [state, onChange],
  );

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
      {availableChannels.findIndex(
        (channel) =>
          COLOR_CHANNELS.indexOf(channel as any) > -1 ||
          channel === 'color_wheel',
      ) > -1 && (
        <>
          <label>
            <span>Color mode</span>
            <select
              value={colorType}
              onChange={(e) =>
                onColorTypeChange(e.target.value as ColorSelectorType)
              }
            >
              <option value="none">None</option>
              <option value="color">Custom Color</option>
              <option value={PaletteColor.PALETTE_PRIMARY}>Primary</option>
              <option value={PaletteColor.PALETTE_SECONDARY}>Secondary</option>
              <option value={PaletteColor.PALETTE_TERTIARY}>Tertiary</option>
              <option value={PaletteColor.PALETTE_WHITE}>White</option>
              <option value={PaletteColor.PALETTE_BLACK}>Black</option>
            </select>
          </label>
          {state.lightColor.case === 'color' && (
            <label>
              <span>Custom color</span>
              <ColorSwatch
                color={state.lightColor.value}
                updateDescription="Update custom color."
              />
            </label>
          )}
          {state.lightColor.case === 'color' && (
            <RangeChannel
              name="White"
              value={state.lightColor.value.white}
              onChange={(v) => {
                if (state.lightColor.case === 'color') {
                  state.lightColor.value.white = v;
                  onChange(state);
                }
              }}
            />
          )}
        </>
      )}
      {(
        availableChannels.filter(
          (channel) => ANGLE_CHANNELS.indexOf(channel as any) > -1,
        ) as Array<keyof Omit<FixtureStateProto, '$typeName'>>
      ).map((channel, i) => (
        <label className={styles.stateRow} key={i}>
          <span>{channel}</span>
          {state[channel] != null ? (
            <>
              <NumberInput
                type="float"
                max={720}
                min={-720}
                value={state[channel] as number}
                onChange={(v) => {
                  state[channel] = v as any;
                  onChange(state);
                }}
              />
              &nbsp;
              <IconButton
                title={`Remove ${channel}`}
                onClick={() => {
                  state[channel] = undefined as any;
                  onChange(state);
                }}
              >
                <IconBxX />
              </IconButton>
            </>
          ) : (
            <IconButton
              title={`Add ${channel}`}
              onClick={() => {
                state[channel] = 0 as any;
                onChange(state);
              }}
            >
              <IconBxPlus />
            </IconButton>
          )}
        </label>
      ))}
      {(
        availableChannels.filter(
          (channel) => AMOUNT_CHANNELS.indexOf(channel as any) > -1,
        ) as Array<keyof Omit<FixtureStateProto, '$typeName'>>
      ).map((channel, i) => (
        <RangeChannel
          key={i}
          name={channel}
          value={state[channel] as number}
          onChange={(v) => {
            state[channel] = v as any;
            onChange(state);
          }}
        />
      ))}
      <label>Channels:</label>
      {state.channels.map((c: FixtureState_Channel, i: number) => (
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
            max={512}
          />
          <NumberInput
            className={styles.input}
            title="value"
            value={c.value}
            onChange={(v) => {
              c.value = v;
              onChange(state);
            }}
            min={0}
            max={255}
          />
          <IconButton
            title="Remove Channel"
            onClick={() => {
              state.channels.splice(i, 1);
              onChange(state);
            }}
          >
            <IconBxX />
          </IconButton>
        </div>
      ))}
      <Button
        onClick={() => {
          state.channels.push(
            create(FixtureState_ChannelSchema, {
              index: 0,
              value: 0,
            }),
          );
          onChange(state);
        }}
      >
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
      {value != null ? (
        <>
          <NumberInput
            type="float"
            max={1}
            min={0}
            value={value}
            onChange={onChange}
          />
          &nbsp;
          <IconButton
            title={`Remove ${name}`}
            onClick={() => onChange(undefined)}
          >
            <IconBxX />
          </IconButton>
        </>
      ) : (
        <IconButton title="Add Strobe" onClick={() => onChange(0)}>
          <IconBxPlus />
        </IconButton>
      )}
    </label>
  );
}
