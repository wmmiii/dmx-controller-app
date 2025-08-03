import { useContext, useEffect, useState } from 'react';

import { ProjectContext } from '../contexts/ProjectContext';

import { RenderingContext } from '../contexts/RenderingContext';
import { WritableWledOutput } from '../engine/context';
import { getOutput } from '../util/projectUtils';

import { WledOutput } from '@dmx-controller/proto/wled_pb';
import { WledRendererContext } from '../contexts/WledRendererContext';
import styles from './Visualizer.module.scss';

import { CiWarning } from 'react-icons/ci';

interface WledVisualizerProps {
  wledOutputId: bigint;
}

export function WledVisualizer({ wledOutputId }: WledVisualizerProps) {
  const { project } = useContext(ProjectContext);
  const { subscribeToRender } = useContext(RenderingContext);
  const { warnings } = useContext(WledRendererContext);

  const [writableWledOutput, setWritableWledOutput] =
    useState<WritableWledOutput | null>(null);

  const wledOutput = getOutput(project, wledOutputId).output
    .value as WledOutput;
  const warning = warnings[wledOutputId.toString()];

  useEffect(() => {
    subscribeToRender(wledOutputId, (output) => {
      setWritableWledOutput(output as WritableWledOutput);
    });
  }, [subscribeToRender, setWritableWledOutput]);

  return (
    <div className={styles.wrapper}>
      {warning && <CiWarning className={styles.warning} title={warning} />}
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
    </div>
  );
}
