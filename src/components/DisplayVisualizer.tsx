import { useContext, useEffect, useRef, useState } from 'react';

import { ProjectContext } from '../contexts/ProjectContext';

import styles from './Visualizer.module.css';

import { DisplayBuffer } from '@dmx-controller/proto/display_pb';
import { BiError } from 'react-icons/bi';
import {
  AllDisplayBuffers,
  RenderError,
  subscribeToDisplayRender,
  subscribeToRenderErrors,
} from '../engine/renderRouter';

export function DisplayVisualizer() {
  const { project } = useContext(ProjectContext);
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const fpsRef = useRef<HTMLLIElement>(null);

  const [errors, setErrors] = useState<Map<string, RenderError>>(new Map());

  const displays = Object.entries(project.displays).sort(([_a, a], [_b, b]) =>
    a.name.localeCompare(b.name),
  );

  // Subscribe to all display renders
  useEffect(() => {
    return subscribeToDisplayRender((buffers: AllDisplayBuffers, fps) => {
      if (fpsRef.current) {
        fpsRef.current.innerText = String(fps);
      }

      // Render each display buffer to its canvas
      for (const [displayId, buffer] of buffers) {
        const canvas = canvasRefs.current.get(displayId.toString());
        if (!canvas) {
          continue;
        }

        renderBufferToCanvas(canvas, buffer);
      }
    });
  }, []);

  // Subscribe to render errors for all displays
  useEffect(() => {
    const unsubscribes = displays.map(([displayId]) => {
      return subscribeToRenderErrors(BigInt(displayId), (err) => {
        setErrors((prev) => {
          const next = new Map(prev);
          if (err) {
            next.set(displayId, err);
          } else {
            next.delete(displayId);
          }
          return next;
        });
      });
    });

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [displays.map(([id]) => id).join(',')]);

  if (displays.length === 0) {
    return null;
  }

  const hasErrors = errors.size > 0;

  return (
    <div className={styles.wrapper}>
      <ol className={styles.visualizer}>
        {displays.map(([displayId, display]) => (
          <li
            key={displayId}
            className={styles.displaySegment}
            title={display.name ?? 'Unknown Display'}
          >
            <canvas
              ref={(el) => {
                if (el) {
                  canvasRefs.current.set(displayId, el);
                } else {
                  canvasRefs.current.delete(displayId);
                }
              }}
              style={{
                width: '100%',
                height: '100%',
                imageRendering: 'pixelated',
              }}
            />
          </li>
        ))}
        <li
          className={styles.warning}
          style={{ display: hasErrors ? undefined : 'none' }}
          title={Array.from(errors.values())
            .map((e) => e.message)
            .join('\n')}
        >
          <BiError />
        </li>
        <li
          ref={fpsRef}
          className={styles.fps}
          style={{ display: hasErrors ? 'none' : undefined }}
          title="frames per second"
        ></li>
      </ol>
    </div>
  );
}

function renderBufferToCanvas(
  canvas: HTMLCanvasElement,
  buffer: DisplayBuffer,
) {
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
}
