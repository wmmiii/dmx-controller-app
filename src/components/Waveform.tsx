import { WaveformData, WaveformLevel } from '@dmx-controller/proto/audio_pb';
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DRAG_DISTANCE_PX_SQ } from '../util/browserUtils';
import { listenToTick } from '../util/time';
import styles from './Waveform.module.css';

// Available LOD levels (must match src-engine/src/waveform.rs)
const LOD_LEVELS = [64, 256, 1024, 4096, 16384];

const MIN_VISIBLE_DURATION_MS = 1_200;
const ZOOM_FACTOR = 1.1;

const BEAT_TRIANGLE_WIDTH = 4;
const BEAT_TRIANGLE_HEIGHT = 6;
const BEAT_LINE_GAP = 1;
const BEAT_MARKER_HEIGHT = BEAT_TRIANGLE_HEIGHT + BEAT_LINE_GAP;

interface WaveformProps {
  className: string;
  waveformData: WaveformData;
  startMs: number;
  endMs: number;
  msToBeat?: (ms: number) => number;
  beatToMs?: (beat: number) => number;
  onViewChange: (startMs: number, endMs: number) => void;
  onSeek?: (timeMs: number) => void;
  getPlayheadMs?: () => number | null;
}

export function Waveform({
  className,
  waveformData,
  startMs,
  endMs,
  msToBeat,
  beatToMs,
  onViewChange,
  onSeek,
  getPlayheadMs,
}: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    startX: number;
    startMs: number;
    endMs: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const trackDurationMs = Number(waveformData.durationMs);

  // Clamp view to track boundaries
  const clampView = useCallback(
    (newStartMs: number, newEndMs: number): [number, number] => {
      let duration = newEndMs - newStartMs;

      // Enforce minimum duration
      if (duration < MIN_VISIBLE_DURATION_MS) {
        duration = MIN_VISIBLE_DURATION_MS;
        newEndMs = newStartMs + duration;
      }

      // If view is wider than track, fit to track
      if (duration >= trackDurationMs) {
        return [0, trackDurationMs];
      }

      // Clamp to track boundaries
      if (newStartMs < 0) {
        return [0, duration];
      }
      if (newEndMs > trackDurationMs) {
        return [trackDurationMs - duration, trackDurationMs];
      }

      return [newStartMs, newEndMs];
    },
    [trackDurationMs],
  );

  // Handle mouse down - start dragging
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onViewChange && !onSeek) {
        return;
      }
      e.preventDefault();
      dragStateRef.current = {
        startX: e.clientX,
        startMs,
        endMs,
      };
      setIsDragging(true);
    },
    [startMs, endMs, onViewChange, onSeek],
  );

  // Handle mouse move - pan view
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragStateRef.current || !onViewChange) {
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const deltaX = e.clientX - dragStateRef.current.startX;
      const canvasWidth = canvas.getBoundingClientRect().width;
      const visibleDuration =
        dragStateRef.current.endMs - dragStateRef.current.startMs;

      // Convert pixel delta to time delta (negative because dragging right moves view left)
      const deltaMsFloat = (-deltaX / canvasWidth) * Number(visibleDuration);
      const deltaMs = Math.round(deltaMsFloat);

      const newStartMs = dragStateRef.current.startMs + deltaMs;
      const newEndMs = dragStateRef.current.endMs + deltaMs;

      const [clampedStart, clampedEnd] = clampView(newStartMs, newEndMs);
      onViewChange(clampedStart, clampedEnd);
    },
    [clampView, onViewChange],
  );

  // Handle mouse up - stop dragging, or seek if the mouse barely moved
  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      const dragState = dragStateRef.current;
      dragStateRef.current = null;
      setIsDragging(false);

      if (!dragState || !onSeek) {
        return;
      }
      if (Math.pow(e.clientX - dragState.startX, 2) >= DRAG_DISTANCE_PX_SQ) {
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      onSeek(dragState.startMs + ratio * (dragState.endMs - dragState.startMs));
    },
    [onSeek],
  );

  // Handle wheel - zoom (vertical) or pan (horizontal)
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!onViewChange) {
        return;
      }
      e.preventDefault();

      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const visibleDuration = endMs - startMs;
      const rect = canvas.getBoundingClientRect();

      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // Horizontal scroll: pan left/right
        const deltaMsFloat =
          (e.deltaX / rect.width) * Number(visibleDuration) * 2;
        const deltaMs = Math.round(deltaMsFloat);

        const newStartMs = startMs + deltaMs;
        const newEndMs = endMs + deltaMs;

        const [clampedStart, clampedEnd] = clampView(newStartMs, newEndMs);
        onViewChange(clampedStart, clampedEnd);
      } else {
        // Vertical scroll: zoom in/out
        const mouseX = e.clientX - rect.left;
        const canvasWidth = rect.width;

        // Calculate the time position under the cursor
        const cursorRatio = mouseX / canvasWidth;
        const cursorTimeMs =
          startMs + Math.round(Number(visibleDuration) * cursorRatio);

        // Calculate zoom factor based on scroll direction
        const zoomMultiplier = e.deltaY > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
        const newDuration = Math.round(
          Number(visibleDuration) * zoomMultiplier,
        );
        // Keep cursor position fixed
        const newStartMs =
          cursorTimeMs - Math.round(Number(newDuration) * cursorRatio);
        const newEndMs = newStartMs + newDuration;

        const [clampedStart, clampedEnd] = clampView(newStartMs, newEndMs);
        onViewChange(clampedStart, clampedEnd);
      }
    },
    [startMs, endMs, clampView, onViewChange],
  );

  // Attach global mouse handlers for dragging
  useEffect(() => {
    if (!onViewChange && !onSeek) {
      return;
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp, onViewChange, onSeek]);

  // Attach wheel handler with passive: false to allow preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onViewChange) {
      return;
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel, onViewChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.scale(dpr, dpr);
        drawWaveform(
          ctx,
          getComputedStyle(canvas),
          width,
          height,
          waveformData,
          startMs,
          endMs,
          msToBeat,
          beatToMs,
        );
      }
    });

    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [waveformData, startMs, endMs, msToBeat, beatToMs]);

  useEffect(() => {
    if (!getPlayheadMs) {
      return;
    }

    return listenToTick(() => {
      const playhead = playheadRef.current;
      if (!playhead) {
        return;
      }

      const playheadMs = getPlayheadMs();
      const visible =
        playheadMs != null &&
        playheadMs >= startMs &&
        playheadMs <= endMs &&
        endMs > startMs;
      if (visible) {
        const ratio = (playheadMs - startMs) / (endMs - startMs);
        playhead.style.left = `${ratio * 100}%`;
        playhead.style.display = '';
      } else {
        playhead.style.display = 'none';
      }
    });
  }, [getPlayheadMs, startMs, endMs]);

  return (
    <div ref={containerRef} className={clsx(className, styles.container)}>
      <canvas
        ref={canvasRef}
        className={clsx(styles.canvas, {
          [styles.dragging]: isDragging,
        })}
        onMouseDown={handleMouseDown}
      />
      {getPlayheadMs && (
        <div
          ref={playheadRef}
          className={styles.playhead}
          style={{ display: 'none' }}
        />
      )}
    </div>
  );
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  styles: CSSStyleDeclaration,
  width: number,
  height: number,
  waveformData: WaveformData,
  startMs: number,
  endMs: number,
  msToBeat: ((ms: number) => number) | undefined,
  beatToMs: ((beat: number) => number) | undefined,
) {
  ctx.clearRect(0, 0, width, height);

  const durationMs = endMs - startMs;
  if (durationMs <= 0) {
    return;
  }

  const level = selectLodLevel(waveformData, width, durationMs);
  if (!level || level.points.length === 0) {
    return;
  }

  // Calculate time range in samples
  const msPerSample = 1000 / waveformData.sampleRate;
  const startSample = Number(startMs) / msPerSample;
  const endSample = Number(endMs) / msPerSample;

  // Calculate which points are visible
  const samplesPerPoint = level.samplesPerPoint;
  const startPointIndex = Math.floor(startSample / samplesPerPoint);
  const endPointIndex = Math.ceil(endSample / samplesPerPoint);

  // Clamp to valid range
  const firstPoint = Math.max(0, startPointIndex);
  const lastPoint = Math.min(level.points.length - 1, endPointIndex);

  if (firstPoint > lastPoint) {
    return;
  }

  // Draw beat markers (triangles and lines)
  if (msToBeat && beatToMs) {
    ctx.fillStyle = styles.getPropertyValue('--col-beat');
    ctx.strokeStyle = styles.getPropertyValue('--col-beat');
    ctx.lineWidth = 1;
    const firstBeat = Math.ceil(msToBeat(startMs));
    for (let beat = firstBeat; ; beat++) {
      const beatMs = beatToMs(beat);
      if (beatMs >= endMs) {
        break;
      }
      const x = ((beatMs - startMs) / durationMs) * width;

      // Draw triangle at top pointing down
      ctx.beginPath();
      ctx.moveTo(x - BEAT_TRIANGLE_WIDTH / 2, 0);
      ctx.lineTo(x + BEAT_TRIANGLE_WIDTH / 2, 0);
      ctx.lineTo(x, BEAT_TRIANGLE_HEIGHT);
      ctx.closePath();
      ctx.fill();

      // Draw line with gap below triangle
      ctx.beginPath();
      ctx.moveTo(x, BEAT_MARKER_HEIGHT);
      ctx.lineTo(x, height - BEAT_MARKER_HEIGHT);
      ctx.stroke();

      // Draw triangle at bottom pointing up
      ctx.beginPath();
      ctx.moveTo(x - BEAT_TRIANGLE_WIDTH / 2, height);
      ctx.lineTo(x + BEAT_TRIANGLE_WIDTH / 2, height);
      ctx.lineTo(x, height - BEAT_TRIANGLE_HEIGHT);
      ctx.closePath();
      ctx.fill();
    }
  }

  const visiblePoints = lastPoint - firstPoint + 1;
  const pointWidth = width / visiblePoints;
  // Reserve space at top and bottom for beat markers
  const waveformTop = BEAT_MARKER_HEIGHT;
  const waveformHeight = height - BEAT_MARKER_HEIGHT * 2;
  const centerY = waveformTop + waveformHeight / 2;
  const amplitude = waveformHeight / 2;

  // Draw bands as smooth filled paths (low on bottom, mid, high on top)
  const bands: Array<{ color: string; getValue: (i: number) => number }> = [
    {
      color: styles.getPropertyValue('--col-low'),
      getValue: (i) => level.points[i].low,
    },
    {
      color: styles.getPropertyValue('--col-mid'),
      getValue: (i) => level.points[i].mid,
    },
    {
      color: styles.getPropertyValue('--col-high'),
      getValue: (i) => level.points[i].high,
    },
  ];

  for (const band of bands) {
    ctx.fillStyle = band.color;
    ctx.beginPath();

    // Start at center left
    ctx.moveTo(0, centerY);

    // Draw top edge (left to right)
    for (let i = firstPoint; i <= lastPoint; i++) {
      const x = (i - firstPoint + 0.5) * pointWidth;
      const h = band.getValue(i) * amplitude;
      ctx.lineTo(x, centerY - h);
    }

    // Draw bottom edge (right to left, mirrored)
    for (let i = lastPoint; i >= firstPoint; i--) {
      const x = (i - firstPoint + 0.5) * pointWidth;
      const h = band.getValue(i) * amplitude;
      ctx.lineTo(x, centerY + h);
    }

    ctx.closePath();
    ctx.fill();
  }
}

function selectLodLevel(
  waveformData: WaveformData,
  canvasWidth: number,
  durationMs: number,
): WaveformLevel | null {
  // Calculate ideal samples per pixel
  const msPerSample = 1000 / waveformData.sampleRate;
  const visibleSamples = Number(durationMs) / msPerSample;
  const idealSamplesPerPoint = visibleSamples / canvasWidth;

  let bestLevel: WaveformLevel | null = null;
  let coarsestLevel: WaveformLevel | null = null;

  for (const lodValue of LOD_LEVELS) {
    const level = waveformData.levels[lodValue];
    if (!level) {
      continue;
    }

    if (
      !coarsestLevel ||
      level.samplesPerPoint > coarsestLevel.samplesPerPoint
    ) {
      coarsestLevel = level;
    }

    if (
      level.samplesPerPoint >= idealSamplesPerPoint &&
      (!bestLevel || level.samplesPerPoint < bestLevel.samplesPerPoint)
    ) {
      bestLevel = level;
    }
  }

  // If no level has enough resolution, the coarsest is the cheapest to draw.
  return bestLevel ?? coarsestLevel;
}
