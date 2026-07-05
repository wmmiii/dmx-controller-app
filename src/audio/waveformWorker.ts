import init, { analyze_waveform } from '../wasm/pkg/wasm_engine';

export interface AnalyzeRequest {
  id: number;
  channels: Float32Array[];
  sampleRate: number;
}

export interface AnalyzeResponse {
  id: number;
  waveform?: Uint8Array;
  error?: string;
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<AnalyzeRequest>) => void) | null;
  postMessage(message: AnalyzeResponse, transfer?: Transferable[]): void;
};

const wasmReady = init();

// Collapse multi-channel audio to mono by taking the sample with the largest
// magnitude across channels for each frame, preserving transient peaks.
function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) {
    return channels[0];
  }

  const length = channels[0].length;
  const mono = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let maxAbs = 0;
    let maxVal = 0;
    for (const channel of channels) {
      const sample = channel[i];
      const abs = Math.abs(sample);
      if (abs > maxAbs) {
        maxAbs = abs;
        maxVal = sample;
      }
    }
    mono[i] = maxVal;
  }
  return mono;
}

scope.onmessage = async (event) => {
  const { id, channels, sampleRate } = event.data;
  try {
    await wasmReady;
    const waveform = analyze_waveform(mixToMono(channels), sampleRate);
    scope.postMessage({ id, waveform }, [waveform.buffer]);
  } catch (error) {
    scope.postMessage({ id, error: String(error) });
  }
};
