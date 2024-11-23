import React, { useContext, useEffect, useMemo, useState } from 'react';

import styles from "./UniverseVisualizer.module.scss";
import { SerialContext } from '../contexts/SerialContext';
import { ProjectContext } from '../contexts/ProjectContext';
import { ChannelTypes, DmxUniverse } from '../engine/fixture';
import { getActiveUniverse } from '../util/projectUtils';

export function UniverseVisualizer() {
  const { project } = useContext(ProjectContext);
  const [universe, setUniverse] = useState<DmxUniverse>(new Uint8Array(512));
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
        .map((f, i) => {
          const definition = project.fixtureDefinitions[f.fixtureDefinitionId];
          // Can happen if the definition is unset.
          if (definition == null) {
            return;
          }

          const getChannel = (type: ChannelTypes): number | undefined => {
            try {
              return parseInt(
                Object.entries(definition.channels)
                  .find(e => e[1].type === type)[0]
              ) + f.channelOffset - 1;
            } catch {
              return undefined;
            }
          };

          const strobe = Object.entries(definition.channels)
            .find(e => e[1].type === 'strobe')?.[1].strobe;

          return {
            id: i,
            name: f.name,
            rIndex: getChannel('red'),
            gIndex: getChannel('green'),
            bIndex: getChannel('blue'),
            wIndex: getChannel('white'),
            strobeIndex: getChannel('strobe'),
            strobe: {
              none: strobe?.noStrobe || 0,
              slow: strobe?.slowStrobe || 0,
              fast: strobe?.fastStrobe || 0,
            },
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

  const t = new Date().getTime();

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

          let background: string;
          let shadow: string;
          if (f.strobeIndex && getValue(f.strobeIndex) === f.strobe.slow && (t % 200) > 100) {
            background = '#000';
            shadow = '#000';
          } else if (f.strobeIndex && getValue(f.strobeIndex) === f.strobe.fast && (t % 100) > 50) {
            background = '#000';
            shadow = '#000';
          } else {
            const redRaw = getValue(f.rIndex);
            const greenRaw = getValue(f.gIndex);
            const blueRaw = getValue(f.bIndex);
            const whiteRaw = getValue(f.wIndex);
            const red = redRaw + whiteRaw;
            const green = greenRaw + whiteRaw;
            const blue = blueRaw + whiteRaw;
            background = `rgb(${Math.min(red, 255)}, ${Math.min(green, 255)}, ${Math.min(blue, 255)})`;
            shadow = `rgb(${Math.max(red - 255, 0)}, ${Math.max(green - 255, 0)}, ${Math.max(blue - 255, 0)})`;
          }

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