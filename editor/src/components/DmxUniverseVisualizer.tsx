import { create } from '@bufbuild/protobuf';
import { ColorSchema } from '@dmx-controller/proto/color_pb';
import { useContext, useEffect, useMemo, useState } from 'react';

import { ProjectContext } from '../contexts/ProjectContext';
import { ChannelTypes } from '../engine/channel';

import { DmxFixtureDefinition_Channel_ColorWheelMapping } from '@dmx-controller/proto/dmx_pb';
import { SerialDmxOutput } from '@dmx-controller/proto/output_pb';
import { RenderingContext } from '../contexts/RenderingContext';
import { DmxOutput } from '../engine/context';
import { getOutput } from '../util/projectUtils';
import styles from './UniverseVisualizer.module.scss';

interface DmxUniverseVisualizerProps {
  dmxOutputId: bigint;
}

export function DmxUniverseVisualizer({
  dmxOutputId,
}: DmxUniverseVisualizerProps) {
  const { project } = useContext(ProjectContext);
  const [universe, setUniverse] = useState<Uint8Array>(new Uint8Array(512));
  const { subscribeToRender } = useContext(RenderingContext);

  const dmxOutput = getOutput(project, dmxOutputId).output
    .value as SerialDmxOutput;

  useEffect(() => {
    subscribeToRender(dmxOutputId, (output) => {
      const dmxOutput = output as DmxOutput;
      setUniverse(dmxOutput.uint8Array);
    });
  }, [subscribeToRender, setUniverse]);

  const fixtureMapping = useMemo(() => {
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
            f.fixtureDefinitionId
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
              (e) => e[1].type === type,
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
          (c) => c[1].type === 'color_wheel',
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

  const getValue = (index: number | undefined) => {
    if (index === undefined || index === -1) {
      return 0;
    } else {
      return universe[index];
    }
  };

  return (
    <ol className={styles.visualizer}>
      {fixtureMapping.map((f, i) => {
        // Can happen if fixture definition is unset.
        if (f == null) {
          return (
            <li
              key={i}
              className={styles.visualizerDot}
              title={'Unknown'}
              style={{
                backgroundColor: '#000',
                boxShadow: '0 0 8px #000',
              }}
            ></li>
          );
        }

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
          red *= dimmerValue / 255;
          green *= dimmerValue / 255;
          blue *= dimmerValue / 255;
        }

        const background = `rgb(${Math.min(red, 255)}, ${Math.min(green, 255)}, ${Math.min(blue, 255)})`;
        const shadow = `rgb(${Math.max(red - 255, 0)}, ${Math.max(green - 255, 0)}, ${Math.max(blue - 255, 0)})`;

        return (
          <li
            key={i}
            className={styles.visualizerDot}
            title={f.name}
            style={{
              backgroundColor: background,
              boxShadow: `0 0 8px ${shadow}`,
            }}
          ></li>
        );
      })}
    </ol>
  );
}
