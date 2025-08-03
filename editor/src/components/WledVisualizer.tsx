import { useContext, useEffect, useState } from 'react';

import { ProjectContext } from '../contexts/ProjectContext';

import { RenderingContext } from '../contexts/RenderingContext';
import { WritableWledOutput } from '../engine/context';
import { getOutput } from '../util/projectUtils';

import { WledOutput } from '@dmx-controller/proto/wled_pb';
import styles from './Visualizer.module.scss';

interface WledVisualizerProps {
  wledOutputId: bigint;
}

export function WledVisualizer({
  wledOutputId: dmxOutputId,
}: WledVisualizerProps) {
  const { project } = useContext(ProjectContext);
  const [writableWledOutput, setWritableWledOutput] =
    useState<WritableWledOutput | null>(null);
  const { subscribeToRender } = useContext(RenderingContext);

  const wledOutput = getOutput(project, dmxOutputId).output.value as WledOutput;

  useEffect(() => {
    subscribeToRender(dmxOutputId, (output) => {
      setWritableWledOutput(output as WritableWledOutput);
    });
  }, [subscribeToRender, setWritableWledOutput]);

  return (
    <ol className={styles.visualizer}>
      {writableWledOutput?.segments.map((s, i) => {
        let red = s.primaryColor.red;
        let green = s.primaryColor.green;
        let blue = s.primaryColor.blue;

        red *= s.brightness;
        green *= s.brightness;
        blue *= s.brightness;

        const background = `rgb(${red * 255}, ${green * 255}, ${blue * 255})`;

        return (
          <li
            key={i}
            className={styles.visualizerSegment}
            title={wledOutput.segments[i].name}
            style={{
              backgroundColor: background,
            }}
          ></li>
        );
      })}
    </ol>
  );
}
