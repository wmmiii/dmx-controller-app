import { toBinary } from '@bufbuild/protobuf';
import { Track, TrackSchema } from '@dmx-controller/proto/audio_pb';
import type { Project } from '@dmx-controller/proto/project_pb';

// WASM module types - these match the generated wasm-bindgen bindings
interface WasmEngineModule {
  beat_t(length_ms: number, offset_ms: bigint, t: bigint): number;
  effective_beat_t(
    live_length_ms: number,
    live_offset_ms: bigint,
    prev_length_ms: number,
    prev_offset_ms: bigint,
    transition_start_ms: bigint,
    transition_duration_ms: bigint,
    t: bigint,
  ): number;
  TrackBeatConverter: new (track_bytes: Uint8Array) => {
    beat_at_time(t_ms: number): number;
    time_at_beat(beat: number): number;
  };
}

let wasmModule: WasmEngineModule | null = null;
let initPromise: Promise<WasmEngineModule> | null = null;

async function initWasm(): Promise<WasmEngineModule> {
  if (wasmModule) {
    return wasmModule;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const wasm = await import('./pkg/wasm_engine');
    await wasm.default();
    wasmModule = wasm as unknown as WasmEngineModule;
    return wasmModule;
  })();

  return initPromise;
}

/**
 * Gets the current beat position using the WASM module.
 * Returns null if WASM isn't loaded yet or beat is not set.
 */
export function getBeatTSync(project: Project): number | null {
  if (!wasmModule) {
    // Trigger async load for next time
    initWasm();
    return null;
  }

  const liveBeat = project.liveBeat;
  if (!liveBeat || liveBeat.lengthMs <= 0) {
    return null;
  }

  const t = BigInt(Date.now());

  const prevBeat = project.prevLiveBeat;
  if (
    prevBeat &&
    prevBeat.lengthMs > 0 &&
    project.beatTransitionDurationMs > 0
  ) {
    return wasmModule.effective_beat_t(
      liveBeat.lengthMs,
      liveBeat.offsetMs,
      prevBeat.lengthMs,
      prevBeat.offsetMs,
      project.beatTransitionStartMs,
      project.beatTransitionDurationMs,
      t,
    );
  }

  return wasmModule.beat_t(liveBeat.lengthMs, liveBeat.offsetMs, t);
}

export interface TrackBeatConverters {
  msToBeat: (ms: number) => number;
  beatToMs: (beat: number) => number;
}

/**
 * Returns conversion functions between absolute track time and fractional
 * beat position, derived from the track's beat keyframes.
 * Returns null if WASM isn't loaded yet or the track has no BPM keyframe.
 */
export function getTrackBeatConverters(
  track: Track,
): TrackBeatConverters | null {
  if (!wasmModule) {
    // Trigger async load for next time
    initWasm();
    return null;
  }

  const hasBpm = track.beatKeyframes.some(
    (k) => k.info.case === 'bpm' && k.info.value > 0,
  );
  if (!hasBpm) {
    return null;
  }

  const converter = new wasmModule.TrackBeatConverter(
    toBinary(TrackSchema, track),
  );
  return {
    msToBeat: (ms) => converter.beat_at_time(ms),
    beatToMs: (beat) => converter.time_at_beat(beat),
  };
}

/**
 * Pre-initialize the WASM module. Call this early in app startup
 * to ensure synchronous functions work immediately when needed.
 */
export function preloadWasm(): Promise<void> {
  return initWasm().then(() => {});
}
