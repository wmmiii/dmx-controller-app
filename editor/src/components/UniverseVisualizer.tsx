import { useContext, useEffect, useMemo, useState } from 'react';

import styles from "./UniverseVisualizer.module.scss";
import { ChannelTypes } from '../engine/fixture';
import { ProjectContext } from '../contexts/ProjectContext';
import { SerialContext } from '../contexts/SerialContext';
import { getActiveUniverse } from '../util/projectUtils';

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
        .map((f, i) => {
          const definition = project.fixtureDefinitions[f.fixtureDefinitionId.toString()];
          // Can happen if the definition is unset.
          if (definition == null) {
            return;
          }

          const getChannel = (type: ChannelTypes): number | undefined => {
            try {
              const entry = Object.entries(definition.channels)
              .find(e => e[1].type === type);
              if (entry == null) {
                return undefined;
              }
              return parseInt(entry[0]) + f.channelOffset - 1;
            } catch {
              return undefined;
            }
          };

          return {
            id: i,
            name: f.name,
            rIndex: getChannel('red'),
            gIndex: getChannel('green'),
            bIndex: getChannel('blue'),
            wIndex: getChannel('white'),
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

          const redRaw = getValue(f.rIndex);
          const greenRaw = getValue(f.gIndex);
          const blueRaw = getValue(f.bIndex);
          const whiteRaw = getValue(f.wIndex);
          const red = redRaw + whiteRaw;
          const green = greenRaw + whiteRaw;
          const blue = blueRaw + whiteRaw;
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
