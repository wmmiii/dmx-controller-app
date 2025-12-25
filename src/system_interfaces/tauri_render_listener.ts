import { fromBinary } from '@bufbuild/protobuf';
import { WledRenderTargetSchema } from '@dmx-controller/proto/wled_pb';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { isTauri } from './util';

// Event payload types matching the Rust structs
interface DmxRenderEvent {
  output_id: string;
  frame: number;
  data: number[];
}

interface WledRenderEvent {
  output_id: string;
  frame: number;
  data: number[];
}

// Subscription callbacks
let dmxSubscriptions: Map<bigint, Array<(data: Uint8Array) => void>> =
  new Map();
let wledSubscriptions: Map<
  bigint,
  Array<(data: import('@dmx-controller/proto/wled_pb').WledRenderTarget) => void>
> = new Map();

/**
 * Subscribe to DMX render events for a specific output
 */
export function subscribeToDmxRender(
  outputId: bigint,
  callback: (data: Uint8Array) => void,
): () => void {
  if (!isTauri) {
    // No-op in web mode
    return () => {};
  }

  let subscribers = dmxSubscriptions.get(outputId);
  if (!subscribers) {
    subscribers = [];
    dmxSubscriptions.set(outputId, subscribers);
  }
  subscribers.push(callback);

  return () => {
    const index = subscribers!.indexOf(callback);
    if (index > -1) {
      subscribers!.splice(index, 1);
    }
  };
}

/**
 * Subscribe to WLED render events for a specific output
 */
export function subscribeToWledRender(
  outputId: bigint,
  callback: (
    data: import('@dmx-controller/proto/wled_pb').WledRenderTarget,
  ) => void,
): () => void {
  if (!isTauri) {
    // No-op in web mode
    return () => {};
  }

  let subscribers = wledSubscriptions.get(outputId);
  if (!subscribers) {
    subscribers = [];
    wledSubscriptions.set(outputId, subscribers);
  }
  subscribers.push(callback);

  return () => {
    const index = subscribers!.indexOf(callback);
    if (index > -1) {
      subscribers!.splice(index, 1);
    }
  };
}

/**
 * Initialize Tauri event listeners for render events.
 * This should be called once when the app starts in Tauri mode.
 */
export async function initTauriRenderListeners(): Promise<
  (() => void) | null
> {
  if (!isTauri) {
    return null;
  }

  const unlisteners: UnlistenFn[] = [];

  // Listen for DMX render events
  const unlisten1 = await listen<DmxRenderEvent>('dmx-render', (event) => {
    const payload = event.payload;
    const outputId = BigInt(payload.output_id);
    const data = new Uint8Array(payload.data);

    // Notify all subscribers for this output
    const subscribers = dmxSubscriptions.get(outputId);
    if (subscribers) {
      subscribers.forEach((callback) => callback(data));
    }
  });
  unlisteners.push(unlisten1);

  // Listen for WLED render events
  const unlisten2 = await listen<WledRenderEvent>('wled-render', (event) => {
    const payload = event.payload;
    const outputId = BigInt(payload.output_id);
    const data = fromBinary(
      WledRenderTargetSchema,
      new Uint8Array(payload.data),
    );

    // Notify all subscribers for this output
    const subscribers = wledSubscriptions.get(outputId);
    if (subscribers) {
      subscribers.forEach((callback) => callback(data));
    }
  });
  unlisteners.push(unlisten2);

  console.log('Tauri render event listeners initialized');

  // Return cleanup function
  return () => {
    unlisteners.forEach((unlisten) => unlisten());
    console.log('Tauri render event listeners cleaned up');
  };
}
