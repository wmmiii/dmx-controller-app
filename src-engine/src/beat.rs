//! Platform-independent beat timing utilities.
//!
//! This module contains pure functions with no threading or I/O dependencies
//! so they can be used both by the Tauri desktop layer and the render engine.

use crate::proto::track::beat_keyframe::Info;
use crate::proto::{BeatMetadata, Project, Track};

use std::time::{SystemTime, UNIX_EPOCH};

/// Maximum number of beat timestamps to retain in the rolling window.
pub const MAX_BEAT_SAMPLES: usize = 8;

/// Minimum samples required before acting on detected beats.
pub const MIN_BEAT_SAMPLES: usize = 4;

/// BPM snap tolerance: if the detected BPM is within this many BPM of a whole
/// number it is rounded to that integer BPM.
const BPM_SNAP_TOLERANCE: f64 = 0.1;

/// Maximum gap (in ms) between consecutive samples before old data is
/// discarded.  Used as a fallback when no beat duration estimate is
/// available yet.
const STALE_SAMPLE_TIMEOUT_MS: f64 = 3000.0;

/// Multiplier applied to the current beat duration estimate to decide
/// whether a gap between samples is large enough to discard history.
const STALE_SAMPLE_FACTOR: f64 = 1.5;

/// Phase tolerance for consistency filtering: samples must arrive within this
/// fraction of a beat from an expected beat position to be accepted.
/// 0.25 = 25% of beat length (±12.5% from ideal position).
const PHASE_TOLERANCE: f64 = 0.25;

/// Outlier rejection threshold: intervals more than this factor away from the
/// median are rejected when calculating beat duration.
const OUTLIER_THRESHOLD: f64 = 0.2;

/// Number of consecutive phase-rejected samples before resetting the sampler.
/// This allows the tempo to change when a new consistent beat pattern emerges.
const PHASE_REJECT_LIMIT: u32 = 4;

/// Minimum allowed BPM for beat detection. Intervals longer than this are rejected.
const MIN_BPM: f64 = 80.0;
/// Maximum allowed BPM for beat detection. Intervals shorter than this are rejected.
const MAX_BPM: f64 = 200.0;
/// Maximum beat interval in ms (corresponding to `MIN_BPM`).
const MAX_INTERVAL_MS: f64 = 60_000.0 / MIN_BPM; // 750ms
/// Minimum beat interval in ms (corresponding to `MAX_BPM`).
const MIN_INTERVAL_MS: f64 = 60_000.0 / MAX_BPM; // 300ms

fn get_beat(track: &Track) -> Result<(f64, f64), String> {
    let keyframes = &track.beat_keyframes;
    let bpm = keyframes
        .iter()
        .find_map(|k| match k.info {
            Some(Info::Bpm(bpm)) => Some(bpm),
            _ => None,
        })
        .ok_or_else(|| "Track has no BPM keyframe!".to_string())?;
    if bpm == 0 {
        return Err("Track BPM keyframe is zero!".to_string());
    }

    let (beat_offset, beat_number) = keyframes
        .iter()
        .find_map(|k| match k.info {
            Some(Info::Beat(beat)) => Some((k.t, beat)),
            _ => None,
        })
        .unwrap_or((0, 0));

    let beat_length = 60_000.0 / f64::from(bpm);
    #[allow(clippy::cast_precision_loss)]
    let beat_offset_ms = beat_offset as f64 - f64::from(beat_number) * beat_length;
    Ok((beat_length, beat_offset_ms))
}

pub fn track_beat_at_time(track: &Track, t_ms: f64) -> Result<f64, String> {
    let (beat_length_ms, beat_offset_ms) = get_beat(track)?;
    let beat = (t_ms - beat_offset_ms) / beat_length_ms;
    Ok(beat.max(0.0))
}

pub fn track_time_at_beat(track: &Track, beat: f64) -> Result<f64, String> {
    let (beat_length_ms, beat_offset_ms) = get_beat(track)?;
    Ok(beat_offset_ms + beat.max(0.0) * beat_length_ms)
}

/// Manages a rolling window of beat timestamps for tempo detection.
///
/// This struct contains only the pure sampling logic (timestamps + beat count).
/// Platform-specific concerns such as async cancellation tokens should be
/// composed alongside it by the caller.
///
/// A single `BeatSampler` can be fed from either user taps (tap-tempo) or an
/// automatic beat detection library — the two sources are mutually exclusive
/// at any given time.  If there is a large gap between the incoming sample
/// and the most recent stored sample the history is discarded automatically,
/// which handles both a user pausing taps and a detection library dropping
/// beats.
pub struct BeatSampler {
    samples: Vec<u64>,
    /// Counts beats across the whole sampling session (not limited to the
    /// rolling window) so that the initial offset can be back-projected.
    beat_count: u32,
    /// Counts consecutive samples rejected by phase-locking. When this exceeds
    /// [`PHASE_REJECT_LIMIT`], the sampler resets to allow tempo changes.
    consecutive_rejects: u32,
}

impl BeatSampler {
    #[must_use]
    pub fn new() -> Self {
        Self {
            samples: Vec::new(),
            beat_count: 0,
            consecutive_rejects: 0,
        }
    }

    /// Records a new beat timestamp and advances the rolling window.
    ///
    /// If `t` is far enough after the most recent stored sample (more than
    /// [`STALE_SAMPLE_FACTOR`] × the current beat duration, or
    /// [`STALE_SAMPLE_TIMEOUT_MS`] when no estimate exists) the old samples
    /// are discarded and the session restarts from this sample.
    ///
    /// Once a stable tempo is established, samples are only accepted if they
    /// arrive within [`PHASE_TOLERANCE`] of an expected beat position. This
    /// prevents erratic detections from disrupting the tempo estimate.
    /// After [`PHASE_REJECT_LIMIT`] consecutive rejections, the sampler resets
    /// to allow tempo changes.
    #[allow(clippy::cast_precision_loss)]
    pub fn add_sample(&mut self, t: u64) -> Option<BeatMetadata> {
        if let Some(&last) = self.samples.last() {
            let gap = (t as f64) - (last as f64);
            let threshold = self
                .beat_duration()
                .map_or(STALE_SAMPLE_TIMEOUT_MS, |d| d * STALE_SAMPLE_FACTOR);
            if gap > threshold || gap < 0.0 {
                self.samples.clear();
                self.beat_count = 0;
                self.consecutive_rejects = 0;
            }
        }

        if !self.should_accept_sample(t) {
            self.consecutive_rejects += 1;
            if self.consecutive_rejects >= PHASE_REJECT_LIMIT {
                self.samples.clear();
                self.samples.push(t);
                self.beat_count = 1;
                self.consecutive_rejects = 0;
            }
            return self.get_beat();
        }

        self.consecutive_rejects = 0;

        self.samples.push(t);
        if self.samples.len() > MAX_BEAT_SAMPLES {
            self.samples.remove(0);
        }
        self.beat_count += 1;
        self.get_beat()
    }

    /// Returns whether the sample should be accepted based on phase-locking.
    ///
    /// Once a stable tempo is established, samples are only accepted if they
    /// arrive within [`PHASE_TOLERANCE`] of an expected beat position.
    #[allow(clippy::cast_precision_loss)]
    fn should_accept_sample(&self, t: u64) -> bool {
        let Some(beat_len) = self.beat_duration() else {
            return true;
        };
        let Some(&last) = self.samples.last() else {
            return true;
        };

        let gap = (t as f64) - (last as f64);
        let beats_elapsed = gap / beat_len;
        let phase_error = (beats_elapsed - beats_elapsed.round()).abs();

        phase_error <= PHASE_TOLERANCE / 2.0
    }

    /// Called when the user explicitly identifies a beat boundary ("first
    /// beat").  Adjusts `beat_count` so the offset calculation in
    /// [`BeatSampler::get_beat`] aligns to this moment.
    #[allow(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        clippy::cast_precision_loss
    )]
    pub fn set_first_beat(&mut self, t: u64) -> Option<BeatMetadata> {
        if self.samples.is_empty() {
            return None;
        }

        let last = self.samples[self.samples.len() - 1];
        let beat_length = self.beat_duration().unwrap_or(500.0);
        let beats_elapsed = ((last as f64 - t as f64) / beat_length).round() as u32;
        self.beat_count = beats_elapsed + 1;
        self.get_beat()
    }

    /// Returns `BeatMetadata` if enough data was collected, or `None` otherwise.
    #[allow(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        clippy::cast_precision_loss
    )]
    fn get_beat(&mut self) -> Option<BeatMetadata> {
        if self.samples.len() < MIN_BEAT_SAMPLES {
            None
        } else if let Some(length_ms) = self.beat_duration() {
            let last_sample = self.samples[self.samples.len() - 1];
            let first_beat = last_sample as f64 - (f64::from(self.beat_count) - 1.0) * length_ms;
            let offset_ms = first_beat.round().max(0.0) as u64;
            Some(BeatMetadata {
                length_ms,
                offset_ms,
            })
        } else {
            None
        }
    }

    /// Returns the current beat duration estimate, or `None` if not enough
    /// samples have been collected yet.
    ///
    /// Uses median-based outlier rejection: intervals that deviate more than
    /// [`OUTLIER_THRESHOLD`] from the median are excluded from the average.
    #[allow(clippy::cast_precision_loss, clippy::cast_possible_wrap)]
    fn beat_duration(&self) -> Option<f64> {
        let samples = &self.samples;
        if samples.len() < 4 {
            return None;
        }

        // Calculate intervals between consecutive samples
        // Filter out non-positive intervals and those outside valid BPM range
        let mut intervals: Vec<f64> = samples
            .windows(2)
            .filter_map(|w| {
                let interval = w[1] as i64 - w[0] as i64;
                if interval > 0 {
                    let interval_f = interval as f64;
                    // Only accept intervals within valid BPM range (80-200 BPM)
                    if (MIN_INTERVAL_MS..=MAX_INTERVAL_MS).contains(&interval_f) {
                        return Some(interval_f);
                    }
                }
                None
            })
            .collect();

        // Need at least 3 valid intervals
        if intervals.len() < 3 {
            return None;
        }

        // Find median interval
        intervals.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let median = if intervals.len().is_multiple_of(2) {
            f64::midpoint(
                intervals[intervals.len() / 2 - 1],
                intervals[intervals.len() / 2],
            )
        } else {
            intervals[intervals.len() / 2]
        };

        // Filter out outliers (intervals deviating more than OUTLIER_THRESHOLD from median)
        let valid_intervals: Vec<f64> = intervals
            .iter()
            .filter(|&&interval| {
                let deviation = (interval - median).abs() / median;
                deviation <= OUTLIER_THRESHOLD
            })
            .copied()
            .collect();

        // Need at least 2 valid intervals for a reasonable estimate
        if valid_intervals.len() < 2 {
            return None;
        }

        // Average the valid intervals
        let mut length_ms = valid_intervals.iter().sum::<f64>() / valid_intervals.len() as f64;
        let bpm = 60_000.0 / length_ms;

        let nearest_whole_bpm = bpm.round();
        if (nearest_whole_bpm - bpm).abs() < BPM_SNAP_TOLERANCE {
            length_ms = 60_000.0 / bpm.round();
        }

        Some(length_ms)
    }
}

impl Default for BeatSampler {
    fn default() -> Self {
        Self::new()
    }
}

/// Returns the effective [`BeatMetadata`] for the current render frame,
/// interpolating through an active beat transition if one is set.
///
/// Returns `None` when `live_beat` has not been initialised yet.
#[must_use]
pub fn effective_beat_metadata(project: &Project, t: u64) -> Option<BeatMetadata> {
    effective_beat_metadata_from_parts(
        project.live_beat,
        project.prev_live_beat,
        project.beat_transition_start_ms,
        project.beat_transition_duration_ms,
        t,
    )
}

/// Returns the effective [`BeatMetadata`] for the current render frame,
/// interpolating through an active beat transition if one is set.
///
/// This variant takes the individual beat fields instead of a full `Project`,
/// making it usable from WASM without needing to serialize the entire project.
///
/// Returns `None` when `live_beat` is `None`.
#[must_use]
#[allow(clippy::cast_precision_loss)]
pub fn effective_beat_metadata_from_parts(
    live_beat: Option<BeatMetadata>,
    prev_live_beat: Option<BeatMetadata>,
    beat_transition_start_ms: u64,
    beat_transition_duration_ms: u64,
    t: u64,
) -> Option<BeatMetadata> {
    let live_beat = live_beat?;
    let Some(from_beat) = prev_live_beat else {
        return Some(live_beat);
    };

    let duration = beat_transition_duration_ms;
    if duration == 0 {
        return Some(live_beat);
    }

    let elapsed = t.saturating_sub(beat_transition_start_ms);
    let progress = (elapsed as f64 / duration as f64).min(1.0);

    if progress >= 1.0 {
        Some(live_beat)
    } else {
        let length_ms =
            from_beat.length_ms + (live_beat.length_ms - from_beat.length_ms) * progress;
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let offset_ms = (from_beat.offset_ms as f64
            + (live_beat.offset_ms as f64 - from_beat.offset_ms as f64) * progress)
            .round()
            .max(0.0) as u64;
        Some(BeatMetadata {
            length_ms,
            offset_ms,
        })
    }
}

/// Returns the current position within the beat cycle as a value in `[0.0, 1.0)`.
///
/// `0.0` represents the start of a beat (full flash) and values approaching
/// `1.0` represent the end of the beat (fully faded).  Returns `None` when no
/// beat metadata is available.
#[allow(clippy::cast_precision_loss)]
pub fn beat_t(beat: &BeatMetadata, t: u64) -> Result<f64, String> {
    beat_t_from_parts(beat.length_ms, beat.offset_ms, t)
}

/// Calculates the effective beat position in one step, combining interpolation
/// and `beat_t` calculation without creating intermediate objects.
///
/// This is the most efficient entry point for WASM, taking all raw parameters
/// and returning the `beat_t` directly.
#[allow(clippy::cast_precision_loss, clippy::too_many_arguments)]
pub fn effective_beat_t_from_parts(
    live_length_ms: f64,
    live_offset_ms: u64,
    prev_length_ms: f64,
    prev_offset_ms: u64,
    transition_start_ms: u64,
    transition_duration_ms: u64,
    t: u64,
) -> Result<f64, String> {
    // If no transition is active, use the live beat directly
    if transition_duration_ms == 0 || prev_length_ms <= 0.0 {
        return beat_t_from_parts(live_length_ms, live_offset_ms, t);
    }

    let elapsed = t.saturating_sub(transition_start_ms);
    let progress = (elapsed as f64 / transition_duration_ms as f64).min(1.0);

    // If transition is complete, use the live beat
    if progress >= 1.0 {
        return beat_t_from_parts(live_length_ms, live_offset_ms, t);
    }

    // Interpolate beat metadata
    let length_ms = prev_length_ms + (live_length_ms - prev_length_ms) * progress;

    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let offset_ms = (prev_offset_ms as f64
        + (live_offset_ms as f64 - prev_offset_ms as f64) * progress)
        .round()
        .max(0.0) as u64;

    beat_t_from_parts(length_ms, offset_ms, t)
}

/// Returns the current position within the beat cycle as a value in `[0.0, 1.0)`.
///
/// This variant takes raw values instead of a `BeatMetadata` struct, making it
/// usable from WASM without needing to construct intermediate objects.
///
/// # Parameters
/// - `length_ms`: Duration of one beat in milliseconds
/// - `offset_ms`: Timestamp (ms since UNIX epoch) when the beat cycle started
/// - `t`: Current time in milliseconds since UNIX epoch
#[allow(clippy::cast_precision_loss)]
pub fn beat_t_from_parts(length_ms: f64, offset_ms: u64, t: u64) -> Result<f64, String> {
    if length_ms <= 0.0 {
        return Err("Beat length is not set!".to_string());
    }
    let elapsed = t as f64 - offset_ms as f64;
    Ok(elapsed / length_ms)
}

/// Populates the `live_beat`, `prev_live_beat`, `beat_transition_start_ms`,
/// and `beat_transition_duration_ms` fields of the provided project.
///
/// First, `effective_beat_metadata` is used to derive the value of
/// `prev_live_beat`.
///
/// Next, the inbound `next_beat`'s `offset_ms` is modified (in increments of
/// `length_ms`) such that the beat count at time `t` is the same between the
/// new `prev_live_beat` value and the `next_beat` to prevent beat count drift
/// during transition.
///
/// Finally the values are set on the project: The start transition time is set
/// to `t` and the transition duration is set to 4 beats of the new `live_beat`.
#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_precision_loss,
    clippy::cast_possible_wrap
)]
pub fn transition_beat(
    project: &mut Project,
    next_beat: &BeatMetadata,
    t: u64,
) -> Result<(), String> {
    let Some(prev_beat) = effective_beat_metadata(project, t) else {
        project.prev_live_beat = Some(*next_beat);
        project.live_beat = Some(*next_beat);
        project.beat_transition_start_ms = t;
        project.beat_transition_duration_ms = 0;
        return Ok(());
    };

    let mut mut_next_beat = *next_beat;

    if prev_beat.length_ms > 0.0 && next_beat.length_ms > 0.0 {
        let prev_beat_t = (t as f64 - prev_beat.offset_ms as f64) / prev_beat.length_ms;
        let next_beat_t = (t as f64 - next_beat.offset_ms as f64) / next_beat.length_ms;
        let n = (prev_beat_t - next_beat_t).round();
        let new_offset = next_beat.offset_ms as f64 - n * next_beat.length_ms;
        mut_next_beat.offset_ms = new_offset.round().max(0.0) as u64;
    }

    let duration_ms = next_beat.length_ms;

    project.prev_live_beat = Some(prev_beat);
    project.live_beat = Some(mut_next_beat);
    project.beat_transition_duration_ms = duration_ms as u64;
    project.beat_transition_start_ms = t;

    Ok(())
}
#[allow(clippy::cast_possible_truncation)]
pub fn set_first_beat(project: &mut Project) -> Result<(), String> {
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;
    let (Some(live_beat), Some(prev_beat)) =
        (project.live_beat.as_mut(), project.prev_live_beat.as_mut())
    else {
        return Err("Beat not set on project!".to_string());
    };

    // This function causes discontinuity. This is acceptable.
    live_beat.offset_ms = t;
    prev_beat.length_ms = live_beat.length_ms;
    prev_beat.offset_ms = t;

    Ok(())
}

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_precision_loss
)]
pub fn set_bpm(project: &mut Project, bpm: u16) -> Result<(), String> {
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;
    let Some(live_beat) = project.live_beat.as_mut() else {
        return Err("Beat not set on project!".to_string());
    };
    let beat_t = (t as f64 - live_beat.offset_ms as f64) / live_beat.length_ms;
    let length = 60_000.0 / f64::from(bpm);

    // Calculate new offset, checking for underflow
    let offset_delta = length * beat_t;
    let new_offset = (t as f64 - offset_delta).round();

    if new_offset < 0.0 {
        return Err(format!(
            "Cannot set BPM: would result in negative offset (current time: {t}, offset delta: {offset_delta:.2})"
        ));
    }

    live_beat.offset_ms = new_offset as u64;
    live_beat.length_ms = length;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proto::track::BeatKeyframe;

    fn bpm_keyframe(t: u64, bpm: u32) -> BeatKeyframe {
        BeatKeyframe {
            t,
            info: Some(Info::Bpm(bpm)),
        }
    }

    fn beat_keyframe(t: u64, beat: u32) -> BeatKeyframe {
        BeatKeyframe {
            t,
            info: Some(Info::Beat(beat)),
        }
    }

    fn track(keyframes: Vec<BeatKeyframe>) -> Track {
        Track {
            beat_keyframes: keyframes,
            ..Default::default()
        }
    }

    #[test]
    fn track_beat_at_time_with_bpm_only() {
        // 120 BPM = 500ms per beat, anchored at beat 0, t=0.
        let track = track(vec![bpm_keyframe(0, 120)]);
        assert_eq!(track_beat_at_time(&track, 0.0), Ok(0.0));
        assert_eq!(track_beat_at_time(&track, 500.0), Ok(1.0));
        assert_eq!(track_beat_at_time(&track, 1780.0), Ok(3.56));
    }

    #[test]
    fn track_beat_at_time_with_first_beat() {
        // 120 BPM, first beat (beat 0) lands at 2000ms.
        let track = track(vec![bpm_keyframe(0, 120), beat_keyframe(2000, 0)]);
        assert_eq!(track_beat_at_time(&track, 2000.0), Ok(0.0));
        assert_eq!(track_beat_at_time(&track, 3000.0), Ok(2.0));
        assert_eq!(track_beat_at_time(&track, 2250.0), Ok(0.5));
    }

    #[test]
    fn track_beat_at_time_with_nonzero_beat_anchor() {
        // 120 BPM, beat 4 lands at 2000ms, so beat 0 lands at t=0.
        let track = track(vec![bpm_keyframe(0, 120), beat_keyframe(2000, 4)]);
        assert_eq!(track_beat_at_time(&track, 2000.0), Ok(4.0));
        assert_eq!(track_beat_at_time(&track, 0.0), Ok(0.0));
        assert_eq!(track_beat_at_time(&track, 500.0), Ok(1.0));
        assert_eq!(track_time_at_beat(&track, 4.0), Ok(2000.0));
        assert_eq!(track_time_at_beat(&track, 1.0), Ok(500.0));
    }

    #[test]
    fn track_beat_at_time_clamps_before_beat_zero() {
        let track = track(vec![bpm_keyframe(0, 120), beat_keyframe(2000, 0)]);
        assert_eq!(track_beat_at_time(&track, 0.0), Ok(0.0));
        assert_eq!(track_beat_at_time(&track, 1999.0), Ok(0.0));
    }

    #[test]
    fn track_time_at_beat_roundtrip() {
        let track = track(vec![bpm_keyframe(0, 120), beat_keyframe(2000, 0)]);
        assert_eq!(track_time_at_beat(&track, 0.0), Ok(2000.0));
        assert_eq!(track_time_at_beat(&track, 2.0), Ok(3000.0));

        let beat = track_beat_at_time(&track, 12345.0).unwrap();
        assert_eq!(track_time_at_beat(&track, beat), Ok(12345.0));
    }

    #[test]
    fn track_time_at_beat_clamps_negative_beats() {
        let track = track(vec![bpm_keyframe(0, 120), beat_keyframe(2000, 0)]);
        assert_eq!(track_time_at_beat(&track, -3.0), Ok(2000.0));
    }

    #[test]
    fn track_beat_conversions_require_bpm() {
        assert!(track_beat_at_time(&track(vec![]), 0.0).is_err());
        assert!(track_time_at_beat(&track(vec![beat_keyframe(0, 0)]), 0.0).is_err());
        assert!(track_beat_at_time(&track(vec![bpm_keyframe(0, 0)]), 0.0).is_err());
    }

    #[test]
    fn add_sample_should_not_return_beat_with_too_few() {
        let mut sampler = BeatSampler::new();
        sampler.add_sample(1000);
        sampler.add_sample(1500);
        let should_none = sampler.add_sample(2000);
        assert!(
            should_none.is_none(),
            "Too few samples should not return value!"
        );
        sampler.add_sample(2500);
        let should_some = sampler.add_sample(3000);
        assert!(should_some.is_some(), "Enough samples should return value!");
    }

    #[test]
    fn add_sample_should_reset_on_backwards_time() {
        let mut sampler = BeatSampler::new();
        // Build up a stable tempo
        for t in [1000, 1500, 2000, 2500, 3000] {
            sampler.add_sample(t);
        }
        assert!(
            sampler.add_sample(3500).is_some(),
            "Should have beat after 6 samples"
        );
        // Adding a sample with earlier timestamp should reset
        let after_reset = sampler.add_sample(2000);
        assert!(
            after_reset.is_none(),
            "Should reset and return None after backwards timestamp"
        );
    }

    #[test]
    fn add_sample_should_return_sane_beat_over_time() {
        let mut sampler = BeatSampler::new();
        let mut t = 0;
        for _ in 0..16 {
            sampler.add_sample(t);
            t += 500;
        }
        let first_beat = sampler.add_sample(t);
        assert_eq!(first_beat.map(|b| b.offset_ms), Some(0));
        assert_eq!(first_beat.map(|b| b.length_ms), Some(500.0));

        // Tempo change: phase-locking will reject off-beat samples until reset
        // After PHASE_REJECT_LIMIT (4) rejections, sampler resets with new tempo
        for _ in 0..16 {
            sampler.add_sample(t);
            t += 400;
        }
        let second_beat = sampler.add_sample(t);
        // After reset and rebuilding with new tempo, we get a new beat
        assert!(second_beat.is_some(), "Should have beat after tempo change");
        assert_eq!(second_beat.map(|b| b.length_ms), Some(400.0));
    }

    #[test]
    fn add_sample_rejects_intervals_outside_bpm_range() {
        // Intervals too fast (>200 BPM = <300ms) should not produce a beat
        let mut sampler = BeatSampler::new();
        for t in [0, 200, 400, 600, 800, 1000] {
            sampler.add_sample(t);
        }
        assert!(
            sampler.add_sample(1200).is_none(),
            "Should reject intervals faster than 200 BPM"
        );

        // Intervals too slow (<80 BPM = >750ms) should not produce a beat
        let mut sampler = BeatSampler::new();
        for t in [0, 1000, 2000, 3000, 4000, 5000] {
            sampler.add_sample(t);
        }
        assert!(
            sampler.add_sample(6000).is_none(),
            "Should reject intervals slower than 80 BPM"
        );

        // Intervals within range (120 BPM = 500ms) should work
        let mut sampler = BeatSampler::new();
        for t in [0, 500, 1000, 1500, 2000, 2500] {
            sampler.add_sample(t);
        }
        assert!(
            sampler.add_sample(3000).is_some(),
            "Should accept intervals within 80-200 BPM range"
        );
    }

    #[test]
    fn set_first_beat_beat_should_set_offset_ms() {
        let mut sampler = BeatSampler::new();
        let mut t = 0;
        for _ in 0..16 {
            sampler.add_sample(t);
            t += 500;
        }
        let first_beat: Option<_> = sampler.add_sample(t);
        assert_eq!(first_beat.map(|b| b.offset_ms), Some(0));
        assert_eq!(first_beat.map(|b| b.length_ms), Some(500.0));
        let second_beat = sampler.set_first_beat(2000);
        assert_eq!(second_beat.map(|b| b.offset_ms), Some(2000));
        assert_eq!(second_beat.map(|b| b.length_ms), Some(500.0));
    }

    #[test]
    fn effective_beat_metadata_identity() {
        let mut project = Project::default();
        project.prev_live_beat = Some(BeatMetadata {
            offset_ms: 0,
            length_ms: 500.0,
        });
        project.live_beat = Some(BeatMetadata {
            offset_ms: 0,
            length_ms: 500.0,
        });
        project.beat_transition_start_ms = 0;
        project.beat_transition_duration_ms = 500;

        assert_eq!(
            effective_beat_metadata(&project, 250),
            Some(BeatMetadata {
                offset_ms: 0,
                length_ms: 500.0
            })
        );
    }

    #[test]
    fn effective_beat_metadata_lerp_fields() {
        let mut project = Project::default();
        project.prev_live_beat = Some(BeatMetadata {
            offset_ms: 0,
            length_ms: 500.0,
        });
        project.live_beat = Some(BeatMetadata {
            offset_ms: 100,
            length_ms: 400.0,
        });
        project.beat_transition_start_ms = 500;
        project.beat_transition_duration_ms = 500;

        assert_eq!(
            effective_beat_metadata(&project, 0),
            Some(BeatMetadata {
                offset_ms: 0,
                length_ms: 500.0
            })
        );

        assert_eq!(
            effective_beat_metadata(&project, 500),
            Some(BeatMetadata {
                offset_ms: 0,
                length_ms: 500.0
            })
        );

        assert_eq!(
            effective_beat_metadata(&project, 750),
            Some(BeatMetadata {
                offset_ms: 50,
                length_ms: 450.0
            })
        );

        assert_eq!(
            effective_beat_metadata(&project, 1000),
            Some(BeatMetadata {
                offset_ms: 100,
                length_ms: 400.0
            })
        );

        assert_eq!(
            effective_beat_metadata(&project, 1500),
            Some(BeatMetadata {
                offset_ms: 100,
                length_ms: 400.0
            })
        );
    }

    #[test]
    fn effective_beat_metadata_interpolate_length() {
        let mut project = Project::default();
        project.prev_live_beat = Some(BeatMetadata {
            offset_ms: 0,
            length_ms: 500.0,
        });
        project.live_beat = Some(BeatMetadata {
            offset_ms: 0,
            length_ms: 400.0,
        });
        project.beat_transition_start_ms = 0;
        project.beat_transition_duration_ms = 500;

        assert_eq!(
            effective_beat_metadata(&project, 250),
            Some(BeatMetadata {
                offset_ms: 0,
                length_ms: 450.0
            })
        );
    }

    #[test]
    fn transition_beat_identity() {
        let mut project = Project::default();
        project.live_beat = Some(BeatMetadata {
            offset_ms: 0,
            length_ms: 500.0,
        });

        transition_beat(
            &mut project,
            &BeatMetadata {
                offset_ms: 0,
                length_ms: 500.0,
            },
            250,
        )
        .unwrap();

        assert_eq!(
            project.live_beat,
            Some(BeatMetadata {
                offset_ms: 0,
                length_ms: 500.0,
            })
        );
    }

    #[test]
    fn transition_beat_should_not_modify_same_beat() {
        let mut project = Project::default();
        project.live_beat = Some(BeatMetadata {
            offset_ms: 0,
            length_ms: 500.0,
        });

        transition_beat(
            &mut project,
            &BeatMetadata {
                offset_ms: 100,
                length_ms: 500.0,
            },
            500,
        )
        .unwrap();

        assert_eq!(
            project.live_beat,
            Some(BeatMetadata {
                offset_ms: 100,
                length_ms: 500.0,
            })
        );
    }

    #[test]
    fn transition_beat_should_sync_beats() {
        let mut project = Project::default();
        project.live_beat = Some(BeatMetadata {
            offset_ms: 0,
            length_ms: 500.0,
        });

        transition_beat(
            &mut project,
            &BeatMetadata {
                offset_ms: 10100,
                length_ms: 500.0,
            },
            500,
        )
        .unwrap();

        assert_eq!(
            project.live_beat,
            Some(BeatMetadata {
                offset_ms: 100,
                length_ms: 500.0,
            })
        );
    }

    #[test]
    fn transition_beat_should_sync_beats_of_different_lengths() {
        // Current beat is on start of beat 4
        // Next beat is on start of beat 5
        let mut project = Project::default();
        project.live_beat = Some(BeatMetadata {
            offset_ms: 0,
            length_ms: 500.0,
        });

        transition_beat(
            &mut project,
            &BeatMetadata {
                offset_ms: 2000,
                length_ms: 400.0,
            },
            2001,
        )
        .unwrap();

        assert_eq!(
            beat_t(&project.prev_live_beat.unwrap(), 2001).map(|b| b.floor()),
            beat_t(&project.live_beat.unwrap(), 2001).map(|b| b.floor())
        );

        assert_eq!(
            project.live_beat,
            Some(BeatMetadata {
                offset_ms: 400,
                length_ms: 400.0,
            })
        );
    }
}
