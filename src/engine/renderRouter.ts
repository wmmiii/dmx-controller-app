import { create } from '@bufbuild/protobuf';
import {
  WledRenderTarget,
  WledRenderTargetSchema,
} from '@dmx-controller/proto/wled_pb';
import {
  initTauriRenderListeners,
  subscribeToDmxRender as tauriSubscribeToDmxRender,
  subscribeToWledRender as tauriSubscribeToWledRender,
} from '../system_interfaces/tauri_render_listener';

export type DmxRenderOutput = Uint8Array;

interface RenderFunctions {
  renderDmx: (outputId: bigint, frame: number) => Promise<DmxRenderOutput>;
  renderWled: (outputId: bigint, frame: number) => Promise<WledRenderTarget>;
}

const EMPTY_RENDER_FUNCTIONS: RenderFunctions = {
  renderDmx: async () => new Uint8Array(512),
  renderWled: async () => create(WledRenderTargetSchema, {}),
};

let renderFunctions = EMPTY_RENDER_FUNCTIONS;
const dmxSubscriptions: Map<
  bigint,
  Array<(o: DmxRenderOutput) => void>
> = new Map();
const wledSubscriptions: Map<
  bigint,
  Array<(o: WledRenderTarget) => void>
> = new Map();

export function setRenderFunctions(f: RenderFunctions) {
  renderFunctions = f;
  return () => {
    renderFunctions = EMPTY_RENDER_FUNCTIONS;
  };
}

export function subscribeToDmxRender(
  outputId: bigint,
  listener: (o: DmxRenderOutput) => void,
) {
  let subscribers = dmxSubscriptions.get(outputId);
  if (!subscribers) {
    subscribers = [];
    dmxSubscriptions.set(outputId, subscribers);
  }
  subscribers.push(listener);

  // Also subscribe to Tauri events if in Tauri mode
  const tauriUnsubscribe = tauriSubscribeToDmxRender(outputId, listener);

  return () => {
    const index = subscribers!.indexOf(listener);
    if (index > -1) {
      subscribers!.splice(index, 1);
    }
    tauriUnsubscribe();
  };
}

export function subscribeToWledRender(
  outputId: bigint,
  listener: (o: WledRenderTarget) => void,
) {
  const subscribers = wledSubscriptions.get(outputId);
  if (subscribers) {
    subscribers.push(listener);
  } else {
    wledSubscriptions.set(outputId, [listener]);
  }

  // Also subscribe to Tauri events if in Tauri mode
  const tauriUnsubscribe = tauriSubscribeToWledRender(outputId, listener);

  return () => {
    const subs = wledSubscriptions.get(outputId);
    if (subs) {
      const index = subs.indexOf(listener);
      if (index > -1) {
        subs.splice(index, 1);
      }
    }
    tauriUnsubscribe();
  };
}

export async function renderDmx(outputId: bigint, frame: number) {
  const output = await renderFunctions.renderDmx(outputId, frame);
  dmxSubscriptions.get(outputId)?.forEach((f) => f(output));
  return output;
}

export async function renderWled(outputId: bigint, frame: number) {
  const output = await renderFunctions.renderWled(outputId, frame);
  wledSubscriptions.get(outputId)?.forEach((f) => f(output));
  return output;
}

/**
 * Initialize render router with Tauri event listeners.
 * Call this once when the app starts.
 */
export async function initRenderRouter(): Promise<(() => void) | null> {
  return await initTauriRenderListeners();
}
