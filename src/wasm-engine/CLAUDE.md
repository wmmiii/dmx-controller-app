# WASM Engine

This directory contains a minimal WASM module exposing shared engine functions for use in the browser. It allows the frontend to perform calculations without IPC overhead to the Tauri backend.

## Purpose

The WASM module currently exposes:

- `beat_t(length_ms, offset_ms, t)` - Calculate beat position given beat metadata and current time
- `effective_beat_t(...)` - Calculate beat position during tempo transitions
- `analyze_waveform(samples, sample_rate)` - Analyze mono audio samples into multi-LOD waveform data (returns a protobuf-encoded `WaveformData`); called from the waveform web worker (`src/audio/waveformWorker.ts`)
- `TrackBeatConverter` - Class that decodes a protobuf-encoded `Track` once at construction and exposes `beat_at_time(t_ms)` / `time_at_beat(beat)` conversions between absolute track time and fractional beat position; used via `getTrackBeatConverters` in `src/wasm/engine.ts`

These functions reuse the logic in `src-engine` (`beat.rs`, `waveform.rs`) but are compiled to WASM for direct use in the browser.

## Building

```bash
pnpm run wasm:build
```

This uses `wasm-pack` to compile the Rust code to WASM and generate TypeScript bindings.

## Usage

The TypeScript wrapper at `src/wasm/engine.ts` provides a convenient interface:

```typescript
import { getBeatTSync } from '../wasm/engine';

// Get current beat position using project beat metadata
const beatT = getBeatTSync(project);
```

## Architecture Notes

- **Shared logic**: This crate depends on `src-engine` to reuse the beat calculation functions
- **Optimized API**: Uses `_from_parts` functions that take raw values instead of structs
- **Type-safe**: Generated TypeScript bindings provide full type safety

## When to Use

Use WASM engine functions for:

- Real-time UI updates that need low latency (beat indicators, visual pulses)
- Animations synchronized to the beat
- Any calculation that would otherwise require an IPC round-trip

Continue using the Tauri backend for:

- DMX rendering (requires hardware access)
- Beat detection / tap tempo (requires timing coordination)
- Project persistence
- MIDI and serial communication
