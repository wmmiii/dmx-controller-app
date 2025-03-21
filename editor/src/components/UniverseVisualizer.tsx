import { useContext, useEffect, useMemo, useState } from 'react';

import styles from "./UniverseVisualizer.module.scss";
import { ProjectContext } from '../contexts/ProjectContext';
import { SerialContext } from '../contexts/SerialContext';
import { getActiveUniverse } from '../util/projectUtils';
import { ChannelTypes } from '../engine/channel';
import { FixtureDefinition_Channel_ColorWheelMapping } from '@dmx-controller/proto/fixture_pb';

export function UniverseVisualizer() {
  const { project } = useContext(ProjectContext);
  const [universe, setUniverse] = useState<Uint8Array>(new Uint8Array(512));
  const { subscribeToUniverseUpdates } = useContext(SerialContext);

  useEffect(() => {
    subscribeToUniverseUpdates(setUniverse);
  }, [subscribeToUniverseUpdates, setUniverse]);

  const fixtureMapping = useMemo(
    () => {
      if (getActiveUniverse(project)?.fixtures == null) {
        return [];
      }

      return Object.values(getActiveUniverse(project).fixtures)
        .sort((a, b) => a.channelOffset - b.channelOffset)
        .map((f, i) => {
          const definition = project.fixtureDefinitions[f.fixtureDefinitionId];
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
              const entry = Object.entries(mode.channels)
                .find(e => e[1].type === type);
              if (entry == null) {
                return undefined;
              }
              return parseInt(entry[0]) + f.channelOffset - 1;
            } catch {
              return undefined;
            }
          };

          const colorWheelIndex = Object.entries(mode.channels).find(c => c[1].type === 'color_wheel');

          return {
            id: i,
            name: f.name,
            offset: f.channelOffset,
            rIndex: getChannel('red'),
            gIndex: getChannel('green'),
            bIndex: getChannel('blue'),
            wIndex: getChannel('white'),
            wheelIndex: colorWheelIndex ? parseInt(colorWheelIndex[0]) + f.channelOffset - 1: undefined,
            dimmerIndex: getChannel('dimmer'),
            mode: mode,
          };
        });
    }, [project]);

  const getValue = (index: number | undefined) => {
    if (index === undefined) {
      return 0;
    } else {
      return universe[index];
    }
  };

  return (
    <ol className={styles.visualizer}>
      {
        fixtureMapping.map((f, i) => {
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
                }}>
              </li>
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
            const mapping = f.mode.channels[f.wheelIndex - f.offset + 1].mapping.value as FixtureDefinition_Channel_ColorWheelMapping;
            const color = mapping.colors.find(c => c.value === wheelSlot)!.color!;
            red = color.red * 255;
            green = color.green * 255;
            blue = color.blue * 255;
          }

          if (f.dimmerIndex != null) {
            const dimmerValue = getValue(f.dimmerIndex);
            red *= (dimmerValue / 255);
            green *= (dimmerValue / 255);
            blue *= (dimmerValue / 255);
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
              }}>
            </li>
          );
        })
      }
    </ol>
  );
}
