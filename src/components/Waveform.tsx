import { WaveformData, WaveformLevel } from '@dmx-controller/proto/audio_pb';
import clsx from 'clsx';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { clampViewRange, useTimelineScroll } from '../hooks/timelineScroll';
import { DRAG_DISTANCE_PX_SQ } from '../util/browserUtils';
import { listenToTick } from '../util/time';
import styles from './Waveform.module.css';

// Available LOD levels (must match src-engine/src/waveform.rs)
const LOD_LEVELS = [64, 256, 1024, 4096, 16384];

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
  subdivisions?: number;
  onViewChange: (startMs: number, endMs: number) => void;
  onSeek?: (timeMs: number) => void;
  playing: boolean;
  getPlayheadMs?: () => number | null;
}

export function Waveform({
  className,
  waveformData,
  startMs,
  endMs,
  msToBeat,
  beatToMs,
  subdivisions,
  onViewChange,
  onSeek,
  playing,
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
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const lastPlayheadMsRef = useRef<number | null>(null);
  const wasPlayingRef = useRef(false);

  const trackDurationMs = Number(waveformData.durationMs);

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

      const [clampedStart, clampedEnd] = clampViewRange(
        newStartMs,
        newEndMs,
        trackDurationMs,
      );
      onViewChange(clampedStart, clampedEnd);
    },
    [trackDurationMs, onViewChange],
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

  useTimelineScroll(
    canvasRef,
    undefined,
    startMs,
    endMs,
    trackDurationMs,
    onViewChange,
    false,
    onViewChange != null,
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width, height });
      }
    });

    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const { width, height } = canvasSize;
    if (!canvas || !ctx || width === 0 || height === 0) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
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
      subdivisions ?? 1,
    );
  }, [
    canvasSize,
    waveformData,
    startMs,
    endMs,
    msToBeat,
    beatToMs,
    subdivisions,
  ]);

  // When playback starts with the playhead off screen, center the view on it
  useEffect(() => {
    const wasPlaying = wasPlayingRef.current;
    wasPlayingRef.current = playing;
    if (!playing || wasPlaying || !getPlayheadMs) {
      return;
    }

    const playheadMs = getPlayheadMs();
    if (playheadMs == null || (playheadMs >= startMs && playheadMs <= endMs)) {
      return;
    }

    const halfWidth = (endMs - startMs) / 2;
    const [viewStart, viewEnd] = clampViewRange(
      Math.round(playheadMs - halfWidth),
      Math.round(playheadMs + halfWidth),
      trackDurationMs,
    );
    onViewChange(viewStart, viewEnd);
  }, [playing, getPlayheadMs, startMs, endMs, trackDurationMs, onViewChange]);

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
      const lastPlayheadMs = lastPlayheadMsRef.current;
      lastPlayheadMsRef.current = playheadMs;

      if (playheadMs == null || endMs <= startMs) {
        playhead.style.display = 'none';
        return;
      }

      let viewStart = startMs;
      let viewEnd = endMs;
      const crossedRightEdge =
        playing &&
        !dragStateRef.current &&
        playheadMs > endMs &&
        lastPlayheadMs != null &&
        lastPlayheadMs <= endMs;
      if (crossedRightEdge) {
        [viewStart, viewEnd] = clampViewRange(
          playheadMs,
          playheadMs + (endMs - startMs),
          trackDurationMs,
        );
        onViewChange(viewStart, viewEnd);
      }

      if (playheadMs >= viewStart && playheadMs <= viewEnd) {
        const ratio = (playheadMs - viewStart) / (viewEnd - viewStart);
        playhead.style.left = `${ratio * 100}%`;
        playhead.style.display = '';
      } else {
        playhead.style.display = 'none';
      }
    });
  }, [playing, getPlayheadMs, startMs, endMs, trackDurationMs, onViewChange]);

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
  subdivisions: number,
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

  // Draw beat markers (triangles and lines) and dashed subdivision lines
  if (msToBeat && beatToMs) {
    ctx.fillStyle = styles.getPropertyValue('--col-beat');
    ctx.strokeStyle = styles.getPropertyValue('--col-beat');
    ctx.lineWidth = 1;
    const subs = Math.max(1, Math.floor(subdivisions));
    const firstIndex = Math.ceil(msToBeat(startMs) * subs);
    for (let index = firstIndex; ; index++) {
      const beatMs = beatToMs(index / subs);
      if (beatMs >= endMs) {
        break;
      }
      const x = ((beatMs - startMs) / durationMs) * width;

      // Draw subdivision
      if (index % subs !== 0) {
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, BEAT_MARKER_HEIGHT);
        ctx.lineTo(x, height - BEAT_MARKER_HEIGHT);
        ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }

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
