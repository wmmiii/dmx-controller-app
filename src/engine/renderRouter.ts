import { create } from '@bufbuild/protobuf';
import {
  WledRenderTarget,
  WledRenderTargetSchema,
} from '@dmx-controller/proto/wled_pb';

export type DmxRenderOutput = Uint8Array;

interface RenderFunctions {
  renderDmx: (outputId: bigint, frame: number) => Promise<DmxRenderOutput>;
  renderWled: (outputId: bigint, frame: number) => Promise<WledRenderTarget>;
}

const EMPTY_RENDER_FUNCTIONS: RenderFunctions = {
  renderDmx: async () => new Uint8Array(512),
  renderWled: async () => create(WledRenderTargetSchema, {}),
};

const FPS_BUFFER_SIZE = 100;

let renderFunctions = EMPTY_RENDER_FUNCTIONS;
const dmxSubscriptions: Map<
  bigint,
  Array<(o: DmxRenderOutput, fps: number) => void>
> = new Map();
const wledSubscriptions: Map<
  bigint,
  Array<(o: WledRenderTarget, fps: number) => void>
> = new Map();

// FPS tracking state
const dmxLastRenderTime: Map<bigint, number> = new Map();
const dmxFpsBuffers: Map<bigint, number[]> = new Map();
const wledLastRenderTime: Map<bigint, number> = new Map();
const wledFpsBuffers: Map<bigint, number[]> = new Map();

/**
 * Calculate smoothed FPS for an output using its FPS buffer.
 */
function calculateSmoothedFps(
  lastRenderTime: Map<bigint, number>,
  fpsBuffers: Map<bigint, number[]>,
  outputId: bigint,
): number {
  const now = Date.now();
  const lastTime = lastRenderTime.get(outputId);

  if (lastTime === undefined) {
    // First render for this output
    lastRenderTime.set(outputId, now);
    fpsBuffers.set(outputId, []);
    return NaN;
  }

  const deltaMs = now - lastTime;
  lastRenderTime.set(outputId, now);

  // Get or create FPS buffer for this output
  let buffer = fpsBuffers.get(outputId) || [];
  buffer.push(deltaMs);

  // Trim buffer to max size
  if (buffer.length > FPS_BUFFER_SIZE) {
    buffer = buffer.slice(buffer.length - FPS_BUFFER_SIZE);
  }
  fpsBuffers.set(outputId, buffer);

  // Calculate average delta and convert to FPS
  const averageDelta = buffer.reduce((a, b) => a + b, 0) / buffer.length;
  return Math.floor(1000 / averageDelta);
}

export function setRenderFunctions(f: RenderFunctions) {
  renderFunctions = f;
  return () => {
    renderFunctions = EMPTY_RENDER_FUNCTIONS;
  };
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

export async function renderDmx(outputId: bigint, frame: number) {
  const output = await renderFunctions.renderDmx(outputId, frame);
  const fps = calculateSmoothedFps(dmxLastRenderTime, dmxFpsBuffers, outputId);
  triggerDmxSubscriptions(outputId, output, fps);
  return output;
}

export async function renderWled(outputId: bigint, frame: number) {
  const output = await renderFunctions.renderWled(outputId, frame);
  const fps = calculateSmoothedFps(
    wledLastRenderTime,
    wledFpsBuffers,
    outputId,
  );
  triggerWledSubscriptions(outputId, output, fps);
  return output;
}

/**
 * Trigger DMX subscriptions with already-rendered data.
 * Used by Tauri event listeners to notify subscribers.
 */
export function triggerDmxSubscriptions(
  outputId: bigint,
  data: Uint8Array,
  fps?: number,
) {
  const calculatedFps =
    fps ?? calculateSmoothedFps(dmxLastRenderTime, dmxFpsBuffers, outputId);
  dmxSubscriptions.get(outputId)?.forEach((f) => f(data, calculatedFps));
}

/**
 * Trigger WLED subscriptions with already-rendered data.
 * Used by Tauri event listeners to notify subscribers.
 */
export function triggerWledSubscriptions(
  outputId: bigint,
  data: WledRenderTarget,
  fps?: number,
) {
  const calculatedFps =
    fps ?? calculateSmoothedFps(wledLastRenderTime, wledFpsBuffers, outputId);
  wledSubscriptions.get(outputId)?.forEach((f) => f(data, calculatedFps));
}
