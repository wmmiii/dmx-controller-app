import { fromBinary } from '@bufbuild/protobuf';
import {
  WaveformData,
  WaveformDataSchema,
} from '@dmx-controller/proto/audio_pb';
import { Project } from '@dmx-controller/proto/project_pb';
import { readCasBlob } from '../system_interfaces/cas';
import type { AnalyzeRequest, AnalyzeResponse } from './waveformWorker';

// =============================================================================
// State management structures
// =============================================================================

// Decoded audio keyed by CAS digest.
const audioCache = new Map<string, Promise<AudioBuffer>>();

type PlaybackState =
  | {
      status: 'loading';
      handle: Promise<void>;
    }
  | {
      status: 'playing';
      buffer: AudioBuffer;
      source: AudioBufferSourceNode;
      // AudioContext time (ms) at which position 0 would have started.
      startTimeMs: number;
    }
  | {
      status: 'paused';
      buffer: AudioBuffer;
      pausedMs: number;
    };

const playbackStates = new Map<bigint, PlaybackState>();

const playbackListeners = new Map<
  bigint,
  Set<(state: PlaybackState) => void>
>();

export function subscribeToPlayback(
  trackId: bigint,
  listener: (state: PlaybackState) => void,
): () => void {
  let trackListeners = playbackListeners.get(trackId);
  if (!trackListeners) {
    trackListeners = new Set();
    playbackListeners.set(trackId, trackListeners);
  }
  trackListeners.add(listener);
  return () => {
    trackListeners.delete(listener);
    if (trackListeners.size === 0) {
      playbackListeners.delete(trackId);
    }
  };
}

function setPlaybackState(trackId: bigint, state: PlaybackState): void {
  playbackStates.set(trackId, state);
  playbackListeners.get(trackId)?.forEach((listener) => {
    try {
      listener(state);
    } catch (error) {
      console.error('Playback listener threw for track', trackId, error);
    }
  });
}

let globalAudioContext: AudioContext | null = null;
function getGlobalAudioContext(): AudioContext {
  if (!globalAudioContext) {
    globalAudioContext = new AudioContext();
  }
  return globalAudioContext;
}

function loadAudioFromCas(digest: string): Promise<AudioBuffer> {
  const existing = audioCache.get(digest);
  if (existing) {
    return existing;
  }

  const promise = readCasBlob(digest).then((blob) =>
    getGlobalAudioContext().decodeAudioData(blob),
  );
  // Allow retries if loading or decoding fails.
  promise.catch(() => audioCache.delete(digest));

  audioCache.set(digest, promise);
  return promise;
}

// =============================================================================
// Waveform functionality
// =============================================================================

let analysisWorker: Worker | null = null;
let nextRequestId = 0;
const pendingAnalyses = new Map<
  number,
  { resolve: (waveform: Uint8Array) => void; reject: (error: Error) => void }
>();

function getAnalysisWorker(): Worker {
  if (!analysisWorker) {
    analysisWorker = new Worker(
      new URL('./waveformWorker.ts', import.meta.url),
      { type: 'module' },
    );
    analysisWorker.onmessage = (event: MessageEvent<AnalyzeResponse>) => {
      const { id, waveform, error } = event.data;
      const pending = pendingAnalyses.get(id);
      if (!pending) {
        return;
      }
      pendingAnalyses.delete(id);
      if (waveform) {
        pending.resolve(waveform);
      } else {
        pending.reject(new Error(error ?? 'Waveform analysis failed'));
      }
    };
  }
  return analysisWorker;
}

function analyzeWaveform(buffer: AudioBuffer): Promise<WaveformData> {
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channel = new Float32Array(buffer.length);
    buffer.copyFromChannel(channel, c);
    channels.push(channel);
  }

  const id = nextRequestId++;
  const request: AnalyzeRequest = {
    id,
    channels,
    sampleRate: buffer.sampleRate,
  };

  return new Promise<Uint8Array>((resolve, reject) => {
    pendingAnalyses.set(id, { resolve, reject });
    getAnalysisWorker().postMessage(
      request,
      channels.map((channel) => channel.buffer),
    );
  }).then((bytes) => fromBinary(WaveformDataSchema, bytes));
}

// Results are not cached here; callers cache via react-query keyed by digest.
export async function getWaveform(digest: string): Promise<WaveformData> {
  const buffer = await loadAudioFromCas(digest);
  return await analyzeWaveform(buffer);
}

// =============================================================================
// Audio buffer playback management
// =============================================================================

// AudioContext and AudioBuffer measure time in seconds; convert to ms at that
// boundary and track everything else in ms.
function durationMs(buffer: AudioBuffer): number {
  return buffer.duration * 1000;
}

function contextTimeMs(): number {
  return getGlobalAudioContext().currentTime * 1000;
}

function getLoadedState(
  trackId: bigint,
): Extract<PlaybackState, { status: 'playing' | 'paused' }> {
  const state = playbackStates.get(trackId);
  if (!state) {
    throw new Error(`Track ${trackId} has not been loaded.`);
  }
  if (state.status === 'loading') {
    throw new Error(`Track ${trackId} is still loading.`);
  }
  return state;
}

function stopSource(
  state: Extract<PlaybackState, { status: 'playing' }>,
): void {
  // Detach onended so stopping isn't mistaken for the natural end of the track.
  state.source.onended = null;
  state.source.stop();
}

function startSource(
  trackId: bigint,
  buffer: AudioBuffer,
  offsetMs: number,
): void {
  const ctx = getGlobalAudioContext();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);

  const clampedOffsetMs = Math.min(Math.max(offsetMs, 0), durationMs(buffer));
  source.onended = () => {
    // Only fires as "natural end of track" if pause/seek didn't detach it.
    const current = playbackStates.get(trackId);
    if (current?.status === 'playing' && current.source === source) {
      setPlaybackState(trackId, {
        status: 'paused',
        buffer,
        pausedMs: durationMs(buffer),
      });
    }
  };

  source.start(0, clampedOffsetMs / 1000);
  setPlaybackState(trackId, {
    status: 'playing',
    buffer,
    source,
    startTimeMs: contextTimeMs() - clampedOffsetMs,
  });
}

export async function load(project: Project, trackId: bigint): Promise<void> {
  const existingState = playbackStates.get(trackId);
  if (existingState) {
    if (existingState.status === 'loading') {
      await existingState.handle;
    }
    return;
  }

  const track = project.tracks[String(trackId)];
  if (!track) {
    throw new Error(`Tried to load unknown track: ${trackId}`);
  }

  const handle = loadAudioFromCas(track.digest).then(
    (buffer) => {
      setPlaybackState(trackId, { status: 'paused', buffer, pausedMs: 0 });
    },
    (error) => {
      // Remove the loading state so the load can be retried.
      playbackStates.delete(trackId);
      throw error;
    },
  );

  setPlaybackState(trackId, { status: 'loading', handle });
  await handle;
}

export async function play(trackId: bigint): Promise<void> {
  const ctx = getGlobalAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  const state = getLoadedState(trackId);
  if (state.status === 'playing') {
    return;
  }

  const offsetMs =
    state.pausedMs >= durationMs(state.buffer) ? 0 : state.pausedMs;
  startSource(trackId, state.buffer, offsetMs);
}

export function pause(trackId: bigint): void {
  const state = getLoadedState(trackId);
  if (state.status !== 'playing') {
    return;
  }

  stopSource(state);
  const elapsedMs = contextTimeMs() - state.startTimeMs;
  setPlaybackState(trackId, {
    status: 'paused',
    buffer: state.buffer,
    pausedMs: Math.min(elapsedMs, durationMs(state.buffer)),
  });
}

export function seek(trackId: bigint, timeMs: number): void {
  const state = getLoadedState(trackId);
  const clampedMs = Math.min(Math.max(timeMs, 0), durationMs(state.buffer));

  if (state.status === 'playing') {
    stopSource(state);
    startSource(trackId, state.buffer, clampedMs);
  } else {
    setPlaybackState(trackId, {
      status: 'paused',
      buffer: state.buffer,
      pausedMs: clampedMs,
    });
  }
}

export function jog(trackId: bigint, deltaMs: number): void {
  const state = getLoadedState(trackId);
  const currentMs =
    state.status === 'playing'
      ? contextTimeMs() - state.startTimeMs
      : state.pausedMs;
  seek(trackId, currentMs + deltaMs);
}

export type PlaybackStatus = PlaybackState['status'] | 'unloaded';

export function getPlaybackStatus(trackId: bigint): PlaybackStatus {
  return playbackStates.get(trackId)?.status ?? 'unloaded';
}

export function getCurrentTimeMs(trackId: bigint): number | null {
  const state = playbackStates.get(trackId);
  if (!state) {
    return null;
  }
  switch (state.status) {
    case 'loading':
      return null;
    case 'playing':
      return contextTimeMs() - state.startTimeMs;
    case 'paused':
      return state.pausedMs;
  }
}
