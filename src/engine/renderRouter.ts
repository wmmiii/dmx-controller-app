export type DmxRenderOutput = Uint8Array;
export type WledRenderOutput = {
  segments: Array<{
    effect: number;
    palette: number;
    primaryColor: {
      red: number;
      green: number;
      blue: number;
    };
    speed: number;
    brightness: number;
  }>;
};

interface RenderFunctions {
  renderDmx: (outputId: bigint, frame: number) => Promise<DmxRenderOutput>;
  renderWled: (outputId: bigint, frame: number) => Promise<WledRenderOutput>;
}

const EMPTY_RENDER_FUNCTIONS: RenderFunctions = {
  renderDmx: async () => new Uint8Array(512),
  renderWled: async () => ({ segments: [] }),
};

let renderFunctions = EMPTY_RENDER_FUNCTIONS;
const dmxSubscriptions: Map<
  bigint,
  Array<(o: DmxRenderOutput) => void>
> = new Map();
const wledSubscriptions: Map<
  bigint,
  Array<(o: WledRenderOutput) => void>
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
  const subscribers = dmxSubscriptions.get(outputId);
  if (subscribers) {
    subscribers.push(listener);
  } else {
    dmxSubscriptions.set(outputId, [listener]);
  }
}

export function subscribeToWledRender(
  outputId: bigint,
  listener: (o: WledRenderOutput) => void,
) {
  const subscribers = wledSubscriptions.get(outputId);
  if (subscribers) {
    subscribers.push(listener);
  } else {
    wledSubscriptions.set(outputId, [listener]);
  }
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
