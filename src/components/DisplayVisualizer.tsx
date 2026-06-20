import { useContext, useEffect, useRef, useState } from 'react';

import { ProjectContext } from '../contexts/ProjectContext';

import styles from './Visualizer.module.css';

import { DisplayBuffer } from '@dmx-controller/proto/display_pb';
import { BiError } from 'react-icons/bi';
import {
  RenderError,
  subscribeToDisplayRender,
  subscribeToRenderErrors,
} from '../engine/renderRouter';

interface DisplayVisualizerProps {
  displayId: bigint;
}

export function DisplayVisualizer({ displayId }: DisplayVisualizerProps) {
  const { project } = useContext(ProjectContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fpsRef = useRef<HTMLLIElement>(null);

  const [error, setError] = useState<RenderError | null>(null);

  const display = project.displays[displayId.toString()];
  const displayName = display?.name ?? 'Unknown Display';

  useEffect(() => {
    return subscribeToDisplayRender(displayId, (buffer: DisplayBuffer, fps) => {
      if (fpsRef.current) {
        fpsRef.current.innerText = String(fps);
      }

      // Render pixel buffer to canvas
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }

      // Set canvas size to match display buffer
      if (canvas.width !== buffer.width || canvas.height !== buffer.height) {
        canvas.width = buffer.width;
        canvas.height = buffer.height;
      }

      // Create ImageData from pixel buffer
      const imageData = ctx.createImageData(buffer.width, buffer.height);
      const pixels = buffer.pixels;

      for (let i = 0; i < buffer.width * buffer.height; i++) {
        const r = Math.round(pixels[i * 3] * 255);
        const g = Math.round(pixels[i * 3 + 1] * 255);
        const b = Math.round(pixels[i * 3 + 2] * 255);
        imageData.data[i * 4] = r;
        imageData.data[i * 4 + 1] = g;
        imageData.data[i * 4 + 2] = b;
        imageData.data[i * 4 + 3] = 255; // Alpha
      }

      ctx.putImageData(imageData, 0, 0);
    });
  }, [displayId]);

  useEffect(() => {
    return subscribeToRenderErrors(displayId, (err) => {
      setError(err);
    });
  }, [displayId]);

  return (
    <div className={styles.wrapper}>
      <ol className={styles.visualizer}>
        <li className={styles.visualizerSegment} title={displayName}>
          <canvas
            ref={canvasRef}
            style={{
              width: '100%',
              height: '100%',
              imageRendering: 'pixelated',
            }}
          />
        </li>
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
