import { createRef, useContext, useEffect, useState } from 'react';

import { ProjectContext } from '../contexts/ProjectContext';

import { getOutput } from '../util/projectUtils';

import styles from './Visualizer.module.scss';

import { WledOutput, WledRenderTarget } from '@dmx-controller/proto/wled_pb';
import { BiError } from 'react-icons/bi';
import {
  RenderError,
  subscribeToRenderErrors,
  subscribeToWledRender,
} from '../engine/renderRouter';

interface WledVisualizerProps {
  wledOutputId: bigint;
}

export function WledVisualizer({ wledOutputId }: WledVisualizerProps) {
  const { project } = useContext(ProjectContext);
  const fpsRef = createRef<HTMLLIElement>();

  const [wledRenderOutput, setWledRenderOutput] =
    useState<WledRenderTarget | null>(null);
  const [error, setError] = useState<RenderError | null>(null);

  const wledOutput = getOutput(project, wledOutputId).output
    .value as WledOutput;

  useEffect(() => {
    return subscribeToWledRender(wledOutputId, (output, fps) => {
      setWledRenderOutput(output);
      if (fpsRef.current) {
        fpsRef.current.innerText = String(fps);
      }
    });
  }, [wledOutputId, fpsRef]);

  useEffect(() => {
    return subscribeToRenderErrors(wledOutputId, (err) => {
      setError(err);
    });
  }, [wledOutputId]);

  return (
    <div className={styles.wrapper}>
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
