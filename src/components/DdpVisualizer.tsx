import { createRef, useContext, useEffect, useState } from 'react';

import { ProjectContext } from '../contexts/ProjectContext';

import styles from './Visualizer.module.css';

import { DdpOutput } from '@dmx-controller/proto/ddp_pb';
import { DisplayRenderTarget } from '@dmx-controller/proto/display_pb';
import { BiError } from 'react-icons/bi';
import {
  RenderError,
  subscribeToDdpRender,
  subscribeToRenderErrors,
} from '../engine/renderRouter';
import { getOutput } from '../util/projectUtils';

interface DdpVisualizerProps {
  ddpOutputId: bigint;
}

export function DdpVisualizer({ ddpOutputId }: DdpVisualizerProps) {
  const { project } = useContext(ProjectContext);
  const fpsRef = createRef<HTMLLIElement>();

  const [ddpRenderOutput, setDdpRenderOutput] =
    useState<DisplayRenderTarget | null>(null);
  const [error, setError] = useState<RenderError | null>(null);

  const ddpOutput = getOutput(project, ddpOutputId).output.value as DdpOutput;

  useEffect(() => {
    return subscribeToDdpRender(ddpOutputId, (output, fps) => {
      setDdpRenderOutput(output);
      if (fpsRef.current) {
        fpsRef.current.innerText = String(fps);
      }
    });
  }, [ddpOutputId, fpsRef]);

  useEffect(() => {
    return subscribeToRenderErrors(ddpOutputId, (err) => {
      setError(err);
    });
  }, [ddpOutputId]);

  let background = 'transparent';
  if (ddpRenderOutput?.color) {
    const red = ddpRenderOutput.color.red * ddpRenderOutput.dimmer * 255;
    const green = ddpRenderOutput.color.green * ddpRenderOutput.dimmer * 255;
    const blue = ddpRenderOutput.color.blue * ddpRenderOutput.dimmer * 255;
    background = `rgb(${red}, ${green}, ${blue})`;
  }

  return (
    <div className={styles.wrapper}>
      <ol className={styles.visualizer}>
        <li
          className={styles.visualizerSegment}
          title={ddpOutput.ipAddress}
          style={{ backgroundColor: background }}
        ></li>
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
