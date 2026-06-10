//! Minimal WASM module for beat timing calculations.
//!
//! This module exposes beat calculation functions that can be called from
//! the frontend without going through the Tauri backend. The beat calculation
//! logic is shared with the native Rust engine via the `dmx-engine` crate.

use dmx_engine::beat::{beat_t_from_parts, effective_beat_t_from_parts};
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
