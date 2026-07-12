import { RefObject, useEffect } from 'react';

const MIN_VISIBLE_DURATION_MS = 1_200;
const ZOOM_FACTOR = 1.1;

export function clampViewRange(
  startMs: number,
  endMs: number,
  totalMs: number,
): [number, number] {
  let duration = endMs - startMs;

  if (duration < MIN_VISIBLE_DURATION_MS) {
    duration = MIN_VISIBLE_DURATION_MS;
    endMs = startMs + duration;
  }

  if (duration >= totalMs) {
    return [0, totalMs];
  }

  if (startMs < 0) {
    return [0, duration];
  }
  if (endMs > totalMs) {
    return [totalMs - duration, totalMs];
  }

  return [startMs, endMs];
}

export function useTimelineScroll(
  listenRef: RefObject<HTMLElement | null>,
  // Element whose bounding rect maps px to time; defaults to listenRef.
  geometryRef: RefObject<HTMLElement | null> | undefined,
  viewStartMs: number,
  viewEndMs: number,
  trackDurationMs: number,
  onViewChange: (startMs: number, endMs: number) => void,
  // When set, plain vertical wheel is left to the browser (e.g. lane
  // scrolling) and only ctrl+wheel (or trackpad pinch) zooms.
  ctrlZoom = false,
  enabled = true,
): void {
  useEffect(() => {
    const listenElement = listenRef.current;
    if (listenElement == null || !enabled) {
      return undefined;
    }

    const onScroll = (ev: WheelEvent) => {
      const geometry = (geometryRef ?? listenRef).current;
      if (geometry == null) {
        return;
      }
      const rect = geometry.getBoundingClientRect();
      const visibleDuration = viewEndMs - viewStartMs;
      if (visibleDuration <= 0 || rect.width <= 0) {
        return;
      }

      if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) {
        // Horizontal scroll: pan left/right
        ev.preventDefault();
        const deltaMs = Math.round(
          (ev.deltaX / rect.width) * visibleDuration * 2,
        );
        const [clampedStart, clampedEnd] = clampViewRange(
          viewStartMs + deltaMs,
          viewEndMs + deltaMs,
          trackDurationMs,
        );
        onViewChange(clampedStart, clampedEnd);
      } else if (!ctrlZoom || ev.ctrlKey) {
        // Vertical scroll: zoom in/out around the cursor position
        ev.preventDefault();
        const cursorRatio = (ev.clientX - rect.left) / rect.width;
        const cursorTimeMs =
          viewStartMs + Math.round(visibleDuration * cursorRatio);
        const zoomMultiplier = ev.deltaY > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
        const newDuration = Math.round(visibleDuration * zoomMultiplier);
        const newStartMs = cursorTimeMs - Math.round(newDuration * cursorRatio);
        const [clampedStart, clampedEnd] = clampViewRange(
          newStartMs,
          newStartMs + newDuration,
          trackDurationMs,
        );
        onViewChange(clampedStart, clampedEnd);
      }
    };

    listenElement.addEventListener('wheel', onScroll, { passive: false });
    return () => listenElement.removeEventListener('wheel', onScroll);
  }, [
    listenRef,
    geometryRef,
    viewStartMs,
    viewEndMs,
    trackDurationMs,
    onViewChange,
    ctrlZoom,
    enabled,
  ]);
}
