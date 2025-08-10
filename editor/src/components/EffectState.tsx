import { create } from '@bufbuild/protobuf';
import {
  Color,
  ColorSchema,
  PaletteColor,
} from '@dmx-controller/proto/color_pb';
import {
  FixtureState_ChannelSchema,
  type FixtureState as FixtureStateProto,
} from '@dmx-controller/proto/effect_pb';
import { Fragment, JSX, useContext } from 'react';

import {
  AMOUNT_CHANNELS,
  ANGLE_CHANNELS,
  COLOR_CHANNELS,
  ChannelTypes,
  WLED_CHANNELS,
} from '../engine/channel';

import { BiPlus, BiTrash } from 'react-icons/bi';
import { ProjectContext } from '../contexts/ProjectContext';
import { Button, IconButton } from './Button';
import { ColorSwatch } from './ColorSwatch';
import styles from './EffectState.module.scss';
import { NumberInpuType, NumberInput } from './Input';

type ColorSelectorType = 'none' | 'color' | PaletteColor;

interface EffectStateProps {
  states: Array<{
    name: string;
    state: FixtureStateProto;
  }>;
  availableChannels: ChannelTypes[];
}

export function EffectState({
  states,
  availableChannels,
}: EffectStateProps): JSX.Element {
  const { save } = useContext(ProjectContext);

  return (
    <div className={styles.effectState}>
      {states.map((s, i) => (
        <div
          key={i}
          style={{
            gridColumnStart: i + 2,
            gridColumnEnd: i + 3,
          }}
        >
          {s.name}
        </div>
      ))}
      {availableChannels.findIndex(
        (channel) =>
          COLOR_CHANNELS.indexOf(channel as any) > -1 ||
          channel === 'color_wheel',
      ) > -1 && <ColorChannel values={states.map((s) => s.state)} />}
      {availableChannels
        .filter((channel) => ANGLE_CHANNELS.indexOf(channel as any) > -1)
        .map((channel) => (
          <Channel
            key={channel}
            name={channel}
            values={states.map((s) => ({
              value: (s.state as any)[channel],
              onChange: (value) => {
                (s.state as any)[channel] = value;
                if (value === undefined) {
                  save(`Removed ${channel} on ${s.name}.`);
                } else {
                  save(`Set ${channel} on ${s.name}.`);
                }
              },
            }))}
            min={-720}
            max={720}
            type="float"
          />
        ))}
      {(
        availableChannels.filter(
          (channel) => AMOUNT_CHANNELS.indexOf(channel as any) > -1,
        ) as Array<keyof FixtureStateProto>
      ).map((channel) => (
        <Channel
          key={channel}
          name={channel}
          values={states.map((s) => ({
            value: (s.state as any)[channel],
            onChange: (value) => {
              (s.state as any)[channel] = value;
              if (value === undefined) {
                save(`Removed ${channel} on ${s.name}.`);
              } else {
                save(`Set ${channel} on ${s.name}.`);
              }
            },
          }))}
          min={0}
          max={1}
          type="float"
        />
      ))}
      {(
        availableChannels.filter(
          (channel) => WLED_CHANNELS.indexOf(channel as any) > -1,
        ) as Array<keyof FixtureStateProto>
      ).map((channel) => (
        <Channel
          key={channel}
          name={channel}
          values={states.map((s) => ({
            value: (s.state as any)[channel],
            onChange: (value) => {
              (s.state as any)[channel] = value;
              if (value === undefined) {
                save(`Removed ${channel} on ${s.name}.`);
              } else {
                save(`Set ${channel} on ${s.name}.`);
              }
            },
          }))}
          min={0}
          max={512}
          type="integer"
        />
      ))}
      <CustomChannels states={states.map((s) => s.state)} />
    </div>
  );
}

interface ChannelProps {
  name: string;
  values: Array<{
    value: number | undefined;
    onChange: (value: number | undefined) => void;
  }>;
  min: number;
  max: number;
  type: NumberInpuType;
}

function Channel({ name, values, min, max, type }: ChannelProps) {
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);
  return (
    <>
      <span style={{ gridColumnStart: 1, gridColumnEnd: 2 }}>
        {displayName}
      </span>
      {values.map((v, i) => (
        <ChannelValue
          key={i}
          stateIndex={i}
          name={name}
          min={min}
          max={max}
          type={type}
          value={v.value}
          onChange={v.onChange}
        />
      ))}
    </>
  );
}

interface ColorChannelProps {
  values: Array<FixtureStateProto>;
}

function ColorChannel({ values }: ColorChannelProps) {
  const { save } = useContext(ProjectContext);

  const colorType = (
    state: FixtureStateProto['lightColor'],
  ): ColorSelectorType => {
    if (state.case === undefined) {
      return 'none';
    } else if (state.case === 'color') {
      return 'color';
    } else if (state.case === 'paletteColor') {
      return state.value;
    } else {
      throw new Error(
        `Unrecognized light color type! ${(state as unknown as any).lightColor}`,
      );
    }
  };

  return (
    <>
      <span style={{ gridColumnStart: 1, gridColumnEnd: 2 }}>Color</span>
      {values.map((s, i) => (
        <div key={i} style={{ gridColumnStart: i + 2, gridColumnEnd: i + 3 }}>
          <select
            value={colorType(s.lightColor)}
            onChange={(e) => {
              if (e.target.value === 'none') {
                s.lightColor = { case: undefined, value: undefined };
              } else if (e.target.value === 'color') {
                s.lightColor = {
                  case: 'color',
                  value: create(ColorSchema, {
                    red: 0,
                    green: 0,
                    blue: 0,
                  }),
                };
              } else {
                s.lightColor = {
                  case: 'paletteColor',
                  value: Number(e.target.value) as unknown as PaletteColor,
                };
              }
              save(`Set color of effect.`);
            }}
          >
            <option value="none">None</option>
            <option value="color">Custom Color</option>
            <option value={PaletteColor.PALETTE_PRIMARY}>Primary</option>
            <option value={PaletteColor.PALETTE_SECONDARY}>Secondary</option>
            <option value={PaletteColor.PALETTE_TERTIARY}>Tertiary</option>
            <option value={PaletteColor.PALETTE_WHITE}>White</option>
            <option value={PaletteColor.PALETTE_BLACK}>Black</option>
          </select>
          {s.lightColor.case === 'color' && (
            <div>
              <ColorSwatch
                color={s.lightColor.value}
                updateDescription="Update custom color."
              />
              <label>
                White:&nbsp;
                <NumberInput
                  min={0}
                  max={0}
                  type="float"
                  value={s.lightColor.value.white || 0}
                  onChange={(value) => {
                    (s.lightColor.value as Color).white = value;
                    save(`Set color of effect.`);
                  }}
                />
              </label>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

interface ChannelValueProps {
  stateIndex: number;
  name: string;
  min: number;
  max: number;
  type: NumberInpuType;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

function ChannelValue({
  stateIndex,
  name,
  min,
  max,
  type,
  value,
  onChange,
}: ChannelValueProps) {
  return (
    <div
      style={{ gridColumnStart: stateIndex + 2, gridColumnEnd: stateIndex + 3 }}
    >
      {value !== undefined ? (
        <div className={styles.value}>
          <NumberInput
            min={min}
            max={max}
            type={type}
            value={value}
            onChange={onChange}
          />
          <IconButton
            title={`Remove ${name}`}
            onClick={() => onChange(undefined)}
          >
            <BiTrash />
          </IconButton>
        </div>
      ) : (
        <IconButton
          className={styles.addButton}
          title={`Add ${name}`}
          onClick={() => onChange(0)}
        >
          <BiPlus />
        </IconButton>
      )}
    </div>
  );
}

interface CustomChannelsProps {
  states: Array<FixtureStateProto>;
}

function CustomChannels({ states }: CustomChannelsProps) {
  const { save } = useContext(ProjectContext);

  const setChannels = new Set(
    states
      .flatMap((s) => s.channels)
      .map((c) => c.index)
      .sort((a, b) => a - b),
  );

  return (
    <>
      <div
        className={styles.customChannelsTitle}
        style={{
          gridColumnStart: 1,
          gridColumnEnd: states.length + 2,
        }}
      >
        Custom DMX Channels
      </div>
      {[...setChannels].map((index) => {
        return (
          <Fragment key={index}>
            <div style={{ gridColumnStart: 1, gridColumnEnd: 2 }}>
              <NumberInput
                value={index}
                onChange={(newIndex) => {
                  for (const state of states) {
                    const channel = state.channels.find(
                      (c) => c.index === index,
                    );
                    state.channels = state.channels.filter(
                      (c) => c.index !== newIndex,
                    );
                    if (channel) {
                      channel.index = newIndex;
                    }
                  }
                  save(`Move channel ${index} to ${newIndex}.`);
                }}
                min={1}
                max={512}
                type="integer"
              />
            </div>
            {states.map((s, i) => {
              const channel = s.channels.find((c) => c.index === index);
              return (
                <ChannelValue
                  key={i}
                  stateIndex={i}
                  name={`Channel ${index}`}
                  min={0}
                  max={255}
                  type="integer"
                  value={channel?.value}
                  onChange={(value) => {
                    if (value !== undefined) {
                      if (channel) {
                        channel.value = value;
                      } else {
                        s.channels.push(
                          create(FixtureState_ChannelSchema, {
                            index: index,
                            value: value,
                          }),
                        );
                      }
                      save(`Set custom channel.`);
                    } else {
                      s.channels = s.channels.filter((c) => c.index !== index);
                      save(`Remove custom channel.`);
                    }
                  }}
                />
              );
            })}
          </Fragment>
        );
      })}
      <div style={{ gridColumnStart: 1, gridColumnEnd: states.length + 2 }}>
        <Button
          onClick={() => {
            const newIndex = Math.max(...setChannels, 0) + 1;
            states[0].channels.push(
              create(FixtureState_ChannelSchema, {
                index: newIndex,
                value: 0,
              }),
            );
            save(`Add custom channel.`);
          }}
        >
          + Add Custom DMX Channel
        </Button>
      </div>
    </>
  );
}
