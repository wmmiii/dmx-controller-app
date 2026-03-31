//! Platform-independent beat timing utilities.
//!
//! This module contains pure functions with no threading or I/O dependencies
//! so they can be used both by the Tauri desktop layer and the render engine.

use crate::proto::{BeatMetadata, Project};

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
}

impl BeatSampler {
    #[must_use]
    pub fn new() -> Self {
        Self {
            samples: Vec::new(),
            beat_count: 0,
        }
    }

    /// Records a new beat timestamp and advances the rolling window.
    ///
    /// If `t` is far enough after the most recent stored sample (more than
    /// [`STALE_SAMPLE_FACTOR`] × the current beat duration, or
    /// [`STALE_SAMPLE_TIMEOUT_MS`] when no estimate exists) the old samples
    /// are discarded and the session restarts from this sample.
    #[allow(clippy::cast_precision_loss)]
    pub fn add_sample(&mut self, t: u64) -> Option<BeatMetadata> {
        if let Some(&last) = self.samples.last() {
            let gap = (t as f64) - (last as f64);
            let threshold = self
                .beat_duration()
                .map_or(STALE_SAMPLE_TIMEOUT_MS, |d| d * STALE_SAMPLE_FACTOR);
            if gap > threshold {
                self.samples.clear();
                self.beat_count = 0;
            }
        }

        self.samples.push(t);
        if self.samples.len() > MAX_BEAT_SAMPLES {
            self.samples.remove(0);
        }
        self.beat_count += 1;
        self.get_beat()
    }

    /// Called when the user explicitly identifies a beat boundary ("first
    /// beat").  Adjusts `beat_count` so the offset calculation in
    /// [`BeatSampler::get_beat`] aligns to this moment.
    #[allow(clippy::cast_precision_loss)]
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
    #[allow(clippy::cast_precision_loss)]
    fn beat_duration(&self) -> Option<f64> {
        let samples = &self.samples;
        if samples.len() < 4 {
            return None;
        }

        let total_length = samples[samples.len() - 1] - samples[0];
        let mut length_ms = total_length as f64 / (samples.len() - 1) as f64;
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
#[allow(clippy::cast_precision_loss)]
pub fn effective_beat_metadata(project: &Project, t: u64) -> Option<BeatMetadata> {
    let live_beat = project.live_beat?;
    let Some(from_beat) = project.prev_live_beat else {
        return Some(live_beat);
    };

    let duration = project.beat_transition_duration_ms;
    if duration == 0 {
        return Some(live_beat);
    }

    let elapsed = t.saturating_sub(project.beat_transition_start_ms);
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
#[must_use]
#[allow(clippy::cast_precision_loss)]
pub fn beat_t(beat: &BeatMetadata, t: u64) -> Result<f64, String> {
    if beat.length_ms <= 0.0 {
        return Err("Beat length is not set!".to_string());
    }
    let elapsed = t as f64 - beat.offset_ms as f64;
    Ok(elapsed / beat.length_ms)
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

#[cfg(test)]
mod tests {
    use super::*;

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
        sampler.add_sample(3500);
        let should_some = sampler.add_sample(2000);
        assert!(should_some.is_some(), "Enough samples should return value!");
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
        for _ in 0..16 {
            sampler.add_sample(t);
            t += 400;
        }
        let second_beat = sampler.add_sample(t);
        assert_eq!(second_beat.map(|b| b.offset_ms), Some(1200));
        assert_eq!(second_beat.map(|b| b.length_ms), Some(400.0));
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
