//! Minimal WASM module for beat timing calculations.
//!
//! This module exposes beat calculation functions that can be called from
//! the frontend without going through the Tauri backend. The beat calculation
//! logic is shared with the native Rust engine via the `dmx-engine` crate.

use dmx_engine::beat::{beat_t_from_parts, effective_beat_t_from_parts};
use prost::Message;
use wasm_bindgen::prelude::*;

/// Calculates the current beat position given beat metadata and current time.
///
/// # Parameters
/// - `length_ms`: Duration of one beat in milliseconds
/// - `offset_ms`: Timestamp (ms since UNIX epoch) when the beat cycle started
/// - `t`: Current time in milliseconds since UNIX epoch
///
/// # Returns
/// The beat position as a floating-point value where:
/// - Integer part = which beat we're on (0-indexed)
/// - Fractional part = position within the beat (0.0 = start, approaching 1.0 = end)
///
/// Returns `Err` if `length_ms` is zero or negative.
#[wasm_bindgen]
pub fn beat_t(length_ms: f64, offset_ms: u64, t: u64) -> Result<f64, JsValue> {
    beat_t_from_parts(length_ms, offset_ms, t).map_err(|e| JsValue::from_str(&e))
}

/// Calculates the effective beat position, interpolating through tempo transitions.
///
/// This function handles smooth tempo changes without jarring beat jumps by
/// interpolating between two beat states during a transition.
///
/// # Parameters
/// - `live_length_ms`: Duration of the current (target) beat in milliseconds
/// - `live_offset_ms`: Offset of the current beat
/// - `prev_length_ms`: Duration of the previous beat (0.0 if no transition)
/// - `prev_offset_ms`: Offset of the previous beat (0 if no transition)
/// - `transition_start_ms`: When the transition started (0 if no transition)
/// - `transition_duration_ms`: How long the transition lasts (0 if no transition)
/// - `t`: Current time in milliseconds since UNIX epoch
///
/// # Returns
/// The beat position as a floating-point value, interpolated through the transition.
/// Returns `Err` if no live beat is set or if beat length is invalid.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn effective_beat_t(
    live_length_ms: f64,
    live_offset_ms: u64,
    prev_length_ms: f64,
    prev_offset_ms: u64,
    transition_start_ms: u64,
    transition_duration_ms: u64,
    t: u64,
) -> Result<f64, JsValue> {
    effective_beat_t_from_parts(
        live_length_ms,
        live_offset_ms,
        prev_length_ms,
        prev_offset_ms,
        transition_start_ms,
        transition_duration_ms,
        t,
    )
    .map_err(|e| JsValue::from_str(&e))
}

/// Active pattern/palette selection for a playlist, computed from raw scalars
/// (see [`active_playlist_selection`]).
///
/// - `transition_amount`: crossfade progress into `next_index` in `[0, 1)`; `0` while holding.
/// - `position_ms`: elapsed time into the current dwell+transition cycle, for a progress bar.
#[wasm_bindgen]
pub struct ActivePlaylistSelection {
    pub current_index: u32,
    pub next_index: u32,
    pub transition_amount: f64,
    pub transitioning: bool,
    pub position_ms: u32,
}

/// Computes which pattern or palette is currently active for a playlist without
/// decoding it: the caller passes the ordering mode, collection length, timing,
/// and current time. Call once per subsystem (patterns, palettes) with that
/// subsystem's `len` and order.
///
/// - `order_kind`: 0 = hold, 1 = sequential, 2 = shuffle
/// - `hold_index`: index of the held item, used only when `order_kind` is 0
///
/// Returns `Err` if `order_kind` is unknown or the playlist timing is unset.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn active_playlist_selection(
    order_kind: u8,
    hold_index: u32,
    len: u32,
    offset_ms: i64,
    dwell_ms: u32,
    transition_ms: u32,
    system_t: u64,
) -> Result<ActivePlaylistSelection, JsValue> {
    let selection = dmx_engine::render::autopilot::active_playlist_selection(
        order_kind,
        hold_index,
        len,
        offset_ms,
        dwell_ms,
        transition_ms,
        system_t,
    )
    .map_err(|e| JsValue::from_str(&e))?;
    Ok(ActivePlaylistSelection {
        current_index: selection.curr_index,
        next_index: selection.next_index,
        transition_amount: selection.transition.unwrap_or(0.0),
        transitioning: selection.transition.is_some(),
        position_ms: selection.position_ms,
    })
}

/// Analyzes mono audio samples and produces multi-LOD waveform data for
/// rendering. Returns a protobuf-encoded `WaveformData` message.
#[wasm_bindgen]
#[must_use]
pub fn analyze_waveform(samples: &[f32], sample_rate: u32) -> Vec<u8> {
    dmx_engine::waveform::analyze_waveform(samples, sample_rate).encode_to_vec()
}

/// Converts between absolute track time and fractional beat position using a
/// track's beat keyframes. Decodes the protobuf-encoded `Track` once at
/// construction so per-call conversions don't re-parse it.
#[wasm_bindgen]
pub struct TrackBeatConverter {
    track: dmx_engine::proto::Track,
}

#[wasm_bindgen]
impl TrackBeatConverter {
    #[wasm_bindgen(constructor)]
    pub fn new(track_bytes: &[u8]) -> Result<TrackBeatConverter, JsValue> {
        let track = dmx_engine::proto::Track::decode(track_bytes)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(TrackBeatConverter { track })
    }

    pub fn beat_at_time(&self, t_ms: f64) -> Result<f64, JsValue> {
        dmx_engine::beat::track_beat_at_time(&self.track, t_ms).map_err(|e| JsValue::from_str(&e))
    }

    pub fn time_at_beat(&self, beat: f64) -> Result<f64, JsValue> {
        dmx_engine::beat::track_time_at_beat(&self.track, beat).map_err(|e| JsValue::from_str(&e))
    }
}
