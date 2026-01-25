import { create } from '@bufbuild/protobuf';
import { ColorSchema } from '@dmx-controller/proto/color_pb';
import { createRef, useContext, useEffect, useMemo, useState } from 'react';

import { ProjectContext } from '../contexts/ProjectContext';
import { ChannelTypes } from '../engine/channel';

import {
  DmxFixtureDefinition_Channel_AmountMapping,
  DmxFixtureDefinition_Channel_ColorWheelMapping,
  DmxFixtureDefinition_Mode,
} from '@dmx-controller/proto/dmx_pb';
import {
  SacnDmxOutput,
  SerialDmxOutput,
} from '@dmx-controller/proto/output_pb';
import { getOutput } from '../util/projectUtils';

import { BiError } from 'react-icons/bi';
import {
  RenderError,
  subscribeToDmxRender,
  subscribeToRenderErrors,
} from '../engine/renderRouter';
import styles from './Visualizer.module.scss';

interface FixtureDetails {
  id: number;
  name: string;
  offset: number;
  rIndex: number | undefined;
  gIndex: number | undefined;
  bIndex: number | undefined;
  wIndex: number | undefined;
  wheelIndex: number | undefined;
  dimmerIndex: number | undefined;
  mode: DmxFixtureDefinition_Mode;
}

interface DmxUniverseVisualizerProps {
  dmxOutputId: bigint;
}

export function DmxUniverseVisualizer({
  dmxOutputId,
}: DmxUniverseVisualizerProps) {
  const { project } = useContext(ProjectContext);
  const fpsRef = createRef<HTMLLIElement>();
  const [error, setError] = useState<RenderError | null>(null);

  const dmxOutput = getOutput(project, dmxOutputId).output.value as
    | SerialDmxOutput
    | SacnDmxOutput;

  const fixtureMapping: (FixtureDetails | undefined)[] = useMemo(() => {
    if (dmxOutput.fixtures == null) {
      return [];
    }

    return Object.values(dmxOutput.fixtures)
      .sort((a, b) => a.channelOffset - b.channelOffset)
      .map((f, i) => {
        if (f.channelOffset === -1) {
          return undefined;
        }

        const definition =
          project.fixtureDefinitions?.dmxFixtureDefinitions[
            f.fixtureDefinitionId.toString()
          ];
        // Can happen if the definition is unset.
        if (definition == null) {
          return undefined;
        }

        const mode = definition.modes[f.fixtureMode];
        if (mode == null) {
          return undefined;
        }

        const getChannel = (type: ChannelTypes): number | undefined => {
          try {
            const entry = Object.entries(mode.channels).find(
              ([_, e]) => e.type === type,
            );
            if (entry == null) {
              return undefined;
            }
            return parseInt(entry[0]) + f.channelOffset - 1;
          } catch {
            return undefined;
          }
        };

        const colorWheelIndex = Object.entries(mode.channels).find(
          ([_, c]) => c.type === 'color_wheel',
        );

        return {
          id: i,
          name: f.name,
          offset: f.channelOffset,
          rIndex: getChannel('red'),
          gIndex: getChannel('green'),
          bIndex: getChannel('blue'),
          wIndex: getChannel('white'),
          wheelIndex: colorWheelIndex
            ? parseInt(colorWheelIndex[0]) + f.channelOffset - 1
            : undefined,
          dimmerIndex: getChannel('dimmer'),
          mode: mode,
        };
      });
  }, [project]);

  useEffect(() => {
    return subscribeToDmxRender(dmxOutputId, (_, fps) => {
      if (fpsRef.current) {
        fpsRef.current.innerText = String(fps);
      }
      setError(null);
    });
  }, [dmxOutputId, fpsRef]);

  useEffect(() => {
    return subscribeToRenderErrors(dmxOutputId, (err) => {
      setError(err);
    });
  }, [dmxOutputId]);

  return (
    <div className={styles.wrapper}>
      <ol className={styles.visualizer}>
        {fixtureMapping.map((f, i) => (
          <FixtureDot key={i} dmxOutputId={dmxOutputId} f={f} />
        ))}
        <li
          className={styles.warning}
          style={{ display: error ? undefined : 'none' }}
          title={error?.message}
        >
          <BiError />
        </li>
        <li
          ref={fpsRef}
          className={styles.fps}
          style={{ display: error ? 'none' : undefined }}
          title="frames per second"
        ></li>
      </ol>
    </div>
  );
}

interface FixtureDotProps {
  dmxOutputId: bigint;
  f: FixtureDetails | undefined;
}

function FixtureDot({ dmxOutputId, f }: FixtureDotProps) {
  const fixtureRef = createRef<HTMLLIElement>();

  useEffect(() => {
    return subscribeToDmxRender(dmxOutputId, (universe, _) => {
      if (!f || !fixtureRef.current) {
        return;
      }

      const getValue = (index: number | undefined) => {
        if (index === undefined || index === -1) {
          return 0;
        } else {
          return universe[index];
        }
      };

      let red = 0;
      let green = 0;
      let blue = 0;
      if (f.rIndex != null) {
        const redRaw = getValue(f.rIndex);
        const greenRaw = getValue(f.gIndex);
        const blueRaw = getValue(f.bIndex);
        const whiteRaw = getValue(f.wIndex);
        red = redRaw + whiteRaw;
        green = greenRaw + whiteRaw;
        blue = blueRaw + whiteRaw;
      } else if (f.wheelIndex != null) {
        const wheelSlot = getValue(f.wheelIndex);
        const mapping = f.mode.channels[f.wheelIndex - f.offset + 1].mapping
          .value as DmxFixtureDefinition_Channel_ColorWheelMapping;
        const color =
          mapping.colors.find((c) => c.value === wheelSlot)?.color ||
          create(ColorSchema, {});
        red = color.red * 255;
        green = color.green * 255;
        blue = color.blue * 255;
      }

      if (f.dimmerIndex != null) {
        const dimmerValue = getValue(f.dimmerIndex);
        const dimmerChannel = Object.values(f.mode.channels).find(
          (c) => c.type === 'dimmer',
        )?.mapping.value as DmxFixtureDefinition_Channel_AmountMapping;
        const mappedDimmerValue =
          (dimmerValue - dimmerChannel.minValue) /
          (dimmerChannel.maxValue - dimmerChannel.minValue);
        red *= mappedDimmerValue;
        green *= mappedDimmerValue;
        blue *= mappedDimmerValue;
      }

      const background = `rgb(${Math.min(red, 255)}, ${Math.min(green, 255)}, ${Math.min(blue, 255)})`;
      const shadow = `rgb(${Math.max(red - 255, 0)}, ${Math.max(green - 255, 0)}, ${Math.max(blue - 255, 0)})`;

      fixtureRef.current.style.background = background;
      fixtureRef.current.style.boxShadow = shadow;
    });
  }, [f, fixtureRef]);

  // Can happen if fixture definition is unset.
  if (f == null) {
    return (
      <li
        className={styles.visualizerDot}
        title={'Unknown'}
        style={{
          backgroundColor: '#000',
          boxShadow: '0 0 8px #000',
        }}
      ></li>
    );
  }

  return (
    <li
      ref={fixtureRef}
      className={styles.visualizerDot}
      title={f.name}
      style={{
        backgroundColor: '#000',
        boxShadow: '0 0 8px #000',
      }}
    ></li>
  );
}
