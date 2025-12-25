import { createRef, useContext, useEffect, useState } from 'react';

import { ProjectContext } from '../contexts/ProjectContext';

import { getOutput } from '../util/projectUtils';

import { WledRendererContext } from '../contexts/WledRendererContext';
import styles from './Visualizer.module.scss';

import { WledOutput, WledRenderTarget } from '@dmx-controller/proto/wled_pb';
import { CiWarning } from 'react-icons/ci';
import { subscribeToWledRender } from '../engine/renderRouter';

interface WledVisualizerProps {
  wledOutputId: bigint;
}

export function WledVisualizer({ wledOutputId }: WledVisualizerProps) {
  const { project } = useContext(ProjectContext);
  const { warnings } = useContext(WledRendererContext);
  const fpsRef = createRef<HTMLLIElement>();

  const [wledRenderOutput, setWledRenderOutput] =
    useState<WledRenderTarget | null>(null);

  const wledOutput = getOutput(project, wledOutputId).output
    .value as WledOutput;
  const warning = warnings[wledOutputId.toString()];

  useEffect(() => {
    subscribeToWledRender(wledOutputId, (output, fps) => {
      setWledRenderOutput(output);
      if (fpsRef.current) {
        fpsRef.current.innerText = String(fps);
      }
    });
  }, [setWledRenderOutput]);

  return (
    <div className={styles.wrapper}>
      {warning && <CiWarning className={styles.warning} title={warning} />}
      <ol className={styles.visualizer}>
        {wledRenderOutput?.segments.map((s, i) => {
          let red = s.primaryColor!.red;
          let green = s.primaryColor!.green;
          let blue = s.primaryColor!.blue;

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
        <li ref={fpsRef} className={styles.fps} title="frames per second"></li>
      </ol>
    </div>
  );
}
