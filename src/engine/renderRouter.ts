import { WledRenderTarget } from '@dmx-controller/proto/wled_pb';
export type DmxRenderOutput = Uint8Array;

const FPS_BUFFER_SIZE = 100;

const dmxSubscriptions: Map<
  bigint,
  Array<(o: DmxRenderOutput, fps: number) => void>
> = new Map();
const wledSubscriptions: Map<
  bigint,
  Array<(o: WledRenderTarget, fps: number) => void>
> = new Map();

// Unified FPS tracking: stores render timestamps for all outputs
const renderTimes: Map<bigint, number[]> = new Map();

/**
 * Calculate smoothed FPS for an output based on its render time history.
 */
function recordAndSmoothFps(outputId: bigint): number {
  const now = Date.now();

  // Get or create render times array for this output
  let times = renderTimes.get(outputId) || [];
  times.push(now);

  // Trim to max buffer size
  if (times.length > FPS_BUFFER_SIZE) {
    times = times.slice(times.length - FPS_BUFFER_SIZE);
  }
  renderTimes.set(outputId, times);

  // Need at least 2 samples to calculate FPS
  if (times.length < 2) {
    return NaN;
  }

  // Calculate average time delta between all consecutive renders
  let totalDelta = 0;
  for (let i = 1; i < times.length; i++) {
    totalDelta += times[i] - times[i - 1];
  }
  const averageDelta = totalDelta / (times.length - 1);

  return Math.floor(1000 / averageDelta);
}

export function subscribeToDmxRender(
  outputId: bigint,
  listener: (o: DmxRenderOutput, fps: number) => void,
) {
  let subscribers = dmxSubscriptions.get(outputId);
  if (!subscribers) {
    subscribers = [];
    dmxSubscriptions.set(outputId, subscribers);
  }
  subscribers.push(listener);

  return () => {
    const index = subscribers!.indexOf(listener);
    if (index > -1) {
      subscribers!.splice(index, 1);
    }
  };
}

export function subscribeToWledRender(
  outputId: bigint,
  listener: (o: WledRenderTarget, fps: number) => void,
) {
  const subscribers = wledSubscriptions.get(outputId);
  if (subscribers) {
    subscribers.push(listener);
  } else {
    wledSubscriptions.set(outputId, [listener]);
  }

  return () => {
    const subs = wledSubscriptions.get(outputId);
    if (subs) {
      const index = subs.indexOf(listener);
      if (index > -1) {
        subs.splice(index, 1);
      }
    }
  };
}

/**
 * Trigger DMX subscriptions with already-rendered data.
 * Used by Tauri event listeners to notify subscribers.
 */
export function triggerDmxSubscriptions(outputId: bigint, data: Uint8Array) {
  const fps = recordAndSmoothFps(outputId);
  dmxSubscriptions.get(outputId)?.forEach((f) => f(data, fps));
}

/**
 * Trigger WLED subscriptions with already-rendered data.
 * Used by Tauri event listeners to notify subscribers.
 */
export function triggerWledSubscriptions(
  outputId: bigint,
  data: WledRenderTarget,
) {
  const fps = recordAndSmoothFps(outputId);
  wledSubscriptions.get(outputId)?.forEach((f) => f(data, fps));
}
