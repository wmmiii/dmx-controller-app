import React, { useContext, useMemo } from 'react';

import styles from "./UniverseVisualizer.module.scss";
import { SerialContext } from '../contexts/SerialContext';
import { ProjectContext } from '../contexts/ProjectContext';
import { ChannelTypes } from '../engine/fixture';

export function UniverseVisualizer() {
  const { project } = useContext(ProjectContext);
  const { lastKnownUniverse } = useContext(SerialContext);

  const fixtureMapping = useMemo(
    () => Object.values(project?.physicalFixtures || {})
      .map((f, i) => {
        const definition = project.fixtureDefinitions[f.fixtureDefinitionId];

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

        return {
          id: i,
          name: f.name,
          rIndex: getChannel('red'),
          gIndex: getChannel('green'),
          bIndex: getChannel('blue'),
          wIndex: getChannel('white'),
        }
      }), [project]);

  const getValue = (index: number | undefined) => {
    if (index === undefined) {
      return 0;
    } else {
      return lastKnownUniverse[index];
    }
  };

  return (
    <ol className={styles.visualizer}>
      {
        fixtureMapping.map((f) => {
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
              key={f.id}
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