//! Beat tracking modelled on madmom's `DBNBeatTrackingProcessor`.
//!
//! madmom splits beat tracking into two stages: a frame-wise *beat activation
//! function* and a dynamic Bayesian network that decodes a beat sequence from
//! it. This module keeps that split, with one substitution: madmom's activation
//! comes from an ensemble of trained recurrent neural networks, which is not
//! something this app can ship or run inside a realtime audio callback, so the
//! activation is derived from a `SuperFlux` onset detection function instead.
//!
//! Stage 1 — activation (`SuperFluxOdf` + `ActivationScaler`):
//! a 100 fps log-magnitude spectrogram on a 24-bands-per-octave logarithmic
//! filterbank, differentiated against a maximum-filtered earlier frame to
//! suppress vibrato, summed into a scalar onset strength, then squashed into
//! the `(0, 1)` pseudo-probability the observation model expects.
//!
//! Stage 2 — decoding (`BeatStateSpace`, `BeatTransitionModel`,
//! `DbnBeatTracker`): madmom's state space and models reproduced exactly. Each
//! hidden state is a (position-in-beat, beat-interval) pair; tempo is constant
//! within a beat and may change at beat boundaries under an exponential
//! penalty. Decoding uses the forward algorithm rather than Viterbi, which is
//! what madmom itself does in `online` mode and is the only option here since
//! audio arrives as a live stream.
//!
//! References:
//! * Böck & Widmer, "Maximum Filter Vibrato Suppression for Onset Detection",
//!   `DAFx` 2013.
//! * Krebs, Böck & Widmer, "An Efficient State Space Model for Joint Tempo and
//!   Meter Tracking", ISMIR 2015.
//! * Böck, Krebs & Widmer, "A Multi-Model Approach to Beat Tracking Considering
//!   Heterogeneous Music Styles", ISMIR 2014.

use dmx_engine::proto::BeatMetadata;
use rustfft::FftPlanner;
use rustfft::num_complex::Complex;
use std::f32::consts::PI;
use std::sync::Arc;

// ---------------------------------------------------------------------------
// Onset detection function (SuperFlux)
// ---------------------------------------------------------------------------

/// Activation frame rate. madmom's beat trackers are all specified at 100 fps
/// and the tempo state space is discretised in frames, so this also fixes the
/// tempo resolution of the DBN.
const FPS: f64 = 100.0;

/// STFT window length in samples (~46 ms at 44.1 kHz), matching the middle of
/// the three frame sizes madmom's `RNNBeatProcessor` uses.
const FRAME_SIZE: usize = 2048;

/// Fraction of the window the onset difference spans, as in madmom's
/// `SpectrogramDifference(diff_ratio=0.5)`. Differencing against a frame that
/// still overlaps the current one keeps the function sharp without making it
/// sensitive to the hop size.
const DIFF_RATIO: f64 = 0.5;

/// Width of the maximum filter applied across frequency to the reference frame.
/// Three bins at quarter-tone resolution tolerates roughly a semitone of
/// vibrato, which is the `SuperFlux` paper's recommendation.
const MAX_FILTER_BINS: usize = 3;

/// Filterbank resolution. Quarter-tone spacing is what makes the maximum filter
/// stage meaningful — coarser banks smear the vibrato the filter is meant to
/// reject.
const BANDS_PER_OCTAVE: f64 = 24.0;
const FMIN_HZ: f64 = 30.0;
const FMAX_HZ: f64 = 17_000.0;
/// Reference pitch the filterbank's centre frequencies are anchored to.
const FREF_HZ: f64 = 440.0;

/// Below this window RMS the frame is treated as silence: the activation is
/// pinned low and the running statistics are frozen so a quiet passage does not
/// rescale the detector's idea of a loud onset.
const SILENCE_RMS: f32 = 0.003;

/// Triangular filter over a contiguous run of FFT bins.
struct Filter {
    start_bin: usize,
    weights: Vec<f32>,
}

/// Logarithmically spaced triangular filterbank with unit-area filters,
/// equivalent to madmom's `LogarithmicFilterbank(norm_filters=True)`.
struct LogFilterbank {
    filters: Vec<Filter>,
}

impl LogFilterbank {
    #[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    fn new(sample_rate: u32, frame_size: usize) -> Self {
        let bin_hz = f64::from(sample_rate) / frame_size as f64;
        let num_bins = frame_size / 2 + 1;

        // Centre frequencies on a log grid anchored at FREF_HZ, then quantised
        // to FFT bins. Quantisation collapses neighbouring centres in the low
        // register, where the grid is finer than the bin spacing, so duplicates
        // are dropped rather than producing degenerate filters.
        let low = (FMIN_HZ / FREF_HZ).log2() * BANDS_PER_OCTAVE;
        let high = (FMAX_HZ / FREF_HZ).log2() * BANDS_PER_OCTAVE;
        let mut centre_bins: Vec<usize> = Vec::new();
        for step in low.floor() as i32..=high.ceil() as i32 {
            let freq = FREF_HZ * 2.0_f64.powf(f64::from(step) / BANDS_PER_OCTAVE);
            if freq < FMIN_HZ || freq > FMAX_HZ {
                continue;
            }
            let bin = (freq / bin_hz).round() as usize;
            if bin == 0 || bin >= num_bins - 1 {
                continue;
            }
            if centre_bins.last() != Some(&bin) {
                centre_bins.push(bin);
            }
        }

        // Each filter rises from the previous centre to its own and falls to the
        // next, so adjacent filters overlap by half their support.
        let filters = (0..centre_bins.len())
            .filter_map(|i| {
                let centre = centre_bins[i];
                let start = if i == 0 { centre.saturating_sub(1) } else { centre_bins[i - 1] };
                let end = if i + 1 == centre_bins.len() {
                    (centre + 1).min(num_bins - 1)
                } else {
                    centre_bins[i + 1]
                };
                if end <= start {
                    return None;
                }

                let mut weights = vec![0.0_f32; end - start + 1];
                for (offset, weight) in weights.iter_mut().enumerate() {
                    let bin = start + offset;
                    *weight = if bin <= centre {
                        (bin - start) as f32 / (centre - start).max(1) as f32
                    } else {
                        (end - bin) as f32 / (end - centre).max(1) as f32
                    };
                }

                let area: f32 = weights.iter().sum();
                if area <= 0.0 {
                    return None;
                }
                for weight in &mut weights {
                    *weight /= area;
                }
                Some(Filter { start_bin: start, weights })
            })
            .collect();

        Self { filters }
    }

    fn num_bands(&self) -> usize {
        self.filters.len()
    }

    fn apply(&self, magnitudes: &[f32], out: &mut [f32]) {
        for (band, filter) in out.iter_mut().zip(self.filters.iter()) {
            *band = filter
                .weights
                .iter()
                .enumerate()
                .map(|(offset, w)| w * magnitudes[filter.start_bin + offset])
                .sum();
        }
    }
}

/// `SuperFlux` onset detection function.
///
/// Each frame is turned into a log-magnitude band spectrum and compared against
/// the spectrum `diff_frames` earlier, after that earlier frame has been passed
/// through a maximum filter across frequency. Only positive differences count,
/// so steady tones and slow swells contribute nothing while true onsets do.
struct SuperFluxOdf {
    fft: Arc<dyn rustfft::Fft<f32>>,
    fft_buffer: Vec<Complex<f32>>,
    fft_scratch: Vec<Complex<f32>>,
    window: Vec<f32>,
    magnitudes: Vec<f32>,
    filterbank: LogFilterbank,
    /// Ring of the last `diff_frames + 1` log-magnitude band spectra.
    history: Vec<Vec<f32>>,
    history_pos: usize,
    frames_seen: usize,
    diff_frames: usize,
}

impl SuperFluxOdf {
    #[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    fn new(sample_rate: u32, hop_size: usize) -> Self {
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(FRAME_SIZE);
        let scratch_len = fft.get_inplace_scratch_len();

        let window: Vec<f32> = (0..FRAME_SIZE)
            .map(|i| {
                let x = 2.0 * PI * i as f32 / (FRAME_SIZE - 1) as f32;
                0.5 * (1.0 - x.cos())
            })
            .collect();

        let diff_frames =
            ((FRAME_SIZE as f64 / hop_size as f64) * DIFF_RATIO).round().max(1.0) as usize;
        let filterbank = LogFilterbank::new(sample_rate, FRAME_SIZE);
        let num_bands = filterbank.num_bands();

        Self {
            fft,
            fft_buffer: vec![Complex::new(0.0, 0.0); FRAME_SIZE],
            fft_scratch: vec![Complex::new(0.0, 0.0); scratch_len],
            window,
            magnitudes: vec![0.0; FRAME_SIZE / 2 + 1],
            filterbank,
            history: vec![vec![0.0; num_bands]; diff_frames + 1],
            history_pos: 0,
            frames_seen: 0,
            diff_frames,
        }
    }

    /// Discards the frame history so the next differences are taken against
    /// fresh frames rather than across a gap.
    fn reset(&mut self) {
        for frame in &mut self.history {
            frame.fill(0.0);
        }
        self.frames_seen = 0;
    }

    /// Returns the onset strength of `frame`, which must be `FRAME_SIZE` long.
    fn process(&mut self, frame: &[f32]) -> f32 {
        for (out, (&sample, &window)) in self
            .fft_buffer
            .iter_mut()
            .zip(frame.iter().zip(self.window.iter()))
        {
            *out = Complex::new(sample * window, 0.0);
        }
        self.fft
            .process_with_scratch(&mut self.fft_buffer, &mut self.fft_scratch);

        for (magnitude, bin) in self.magnitudes.iter_mut().zip(self.fft_buffer.iter()) {
            *magnitude = bin.norm();
        }

        let current = self.history_pos;
        self.filterbank
            .apply(&self.magnitudes, &mut self.history[current]);
        // Logarithmic compression, as in madmom's LogarithmicSpectrogram with
        // its default mul=1/add=1: bounded at 0 for silent bands, and it turns
        // the difference below into a ratio so onsets register equally at any
        // playback level.
        for band in &mut self.history[current] {
            *band = (1.0 + *band).log10();
        }

        self.history_pos = (self.history_pos + 1) % self.history.len();
        self.frames_seen += 1;
        if self.frames_seen <= self.diff_frames {
            return 0.0;
        }

        let reference = (current + self.history.len() - self.diff_frames) % self.history.len();
        let num_bands = self.filterbank.num_bands();
        let half = MAX_FILTER_BINS / 2;
        (0..num_bands)
            .map(|band| {
                let lo = band.saturating_sub(half);
                let hi = (band + half + 1).min(num_bands);
                let reference_max = self.history[reference][lo..hi]
                    .iter()
                    .copied()
                    .fold(f32::NEG_INFINITY, f32::max);
                (self.history[current][band] - reference_max).max(0.0)
            })
            .sum()
    }
}

// ---------------------------------------------------------------------------
// Activation scaling
// ---------------------------------------------------------------------------

/// Time constant of the running onset statistics, in frames (~8 s at 100 fps).
const STAT_TAU_FRAMES: f32 = 800.0;
/// Standardised onset strength that maps to an activation of 0.5.
const ACT_Z_BIAS: f32 = 1.5;
/// Standardised onset strength spanned by the logistic's transition band.
const ACT_Z_SCALE: f32 = 0.5;
/// Activations are kept strictly inside `(0, 1)`; the observation model takes
/// the log of both `act` and `1 - act`.
const ACT_MIN: f32 = 1e-3;
/// Absolute floor on the deviation estimate, so a near-constant onset function
/// cannot be amplified into spurious activations.
const DEVIATION_FLOOR: f32 = 1e-5;

/// Converts raw onset strength into the `(0, 1)` beat activation the DBN's
/// observation model expects.
///
/// madmom's RNN emits a calibrated probability directly. A spectral flux
/// function does not: its scale depends on the material and the input gain, and
/// it has no upper bound. Standardising against a slow running mean and mean
/// absolute deviation removes both dependencies, and the logistic then maps the
/// result onto the probability scale the observation model is defined over.
struct ActivationScaler {
    mean: f32,
    deviation: f32,
    frames_seen: u32,
}

impl ActivationScaler {
    fn new() -> Self {
        Self { mean: 0.0, deviation: 0.0, frames_seen: 0 }
    }

    #[allow(clippy::cast_precision_loss)]
    fn scale(&mut self, odf: f32) -> f32 {
        // Warm up by weighting the n-th frame as 1/n, so the estimate converges
        // immediately instead of crawling up from zero and reading every early
        // frame as an onset. Once warm, this settles into a plain EMA.
        self.frames_seen = self.frames_seen.saturating_add(1);
        let alpha = (1.0 / self.frames_seen as f32).max(1.0 / STAT_TAU_FRAMES);

        let z = (odf - self.mean) / self.deviation.max(DEVIATION_FLOOR);

        self.mean += alpha * (odf - self.mean);
        self.deviation += alpha * ((odf - self.mean).abs() - self.deviation);

        let activation = 1.0 / (1.0 + (-(z - ACT_Z_BIAS) / ACT_Z_SCALE).exp());
        activation.clamp(ACT_MIN, 1.0 - ACT_MIN)
    }
}

// ---------------------------------------------------------------------------
// State space, transition and observation models
// ---------------------------------------------------------------------------

/// Slowest tempo the state space models.
///
/// madmom defaults to 55–215 BPM. This range is deliberately narrower: without
/// a trained activation function the decoder is more prone to locking onto half
/// or double time, and a lighting rig wants the perceptual main beat rather
/// than the tatum.
const MIN_BPM: f64 = 75.0;
/// Fastest tempo the state space models.
const MAX_BPM: f64 = 190.0;

/// Penalty on tempo change at a beat boundary. Higher values prefer a constant
/// tempo; this is madmom's default.
const TRANSITION_LAMBDA: f64 = 100.0;

/// Fraction of the beat period that counts as "on the beat": the first
/// `1 / OBSERVATION_LAMBDA` of each beat observes the activation itself, the
/// rest observes its complement. madmom's default.
const OBSERVATION_LAMBDA: f64 = 16.0;

/// Transition probabilities at or below this are dropped from the sparse model.
const TRANSITION_THRESHOLD: f64 = f64::EPSILON;

/// Discretised (position-in-beat, beat-interval) state space.
///
/// One interval is one whole number of frames per beat. An interval of `i`
/// frames contributes `i` states whose positions are `0, 1/i, … (i-1)/i`, so
/// the whole space is a set of loops of different lengths.
struct BeatStateSpace {
    state_positions: Vec<f32>,
    state_intervals: Vec<u32>,
    first_states: Vec<usize>,
    last_states: Vec<usize>,
}

impl BeatStateSpace {
    #[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    fn new(min_interval: f64, max_interval: f64) -> Self {
        let min = min_interval.round().max(1.0) as u32;
        let max = max_interval.round().max(f64::from(min)) as u32;

        let mut state_positions = Vec::new();
        let mut state_intervals = Vec::new();
        let mut first_states = Vec::new();
        let mut last_states = Vec::new();

        for interval in min..=max {
            first_states.push(state_positions.len());
            for step in 0..interval {
                state_positions.push(step as f32 / interval as f32);
                state_intervals.push(interval);
            }
            last_states.push(state_positions.len() - 1);
        }

        Self { state_positions, state_intervals, first_states, last_states }
    }

    fn num_states(&self) -> usize {
        self.state_positions.len()
    }
}

/// Sparse transition model in compressed-row form, indexed by destination state.
///
/// Within a beat the only move is to the next position at the same tempo. At the
/// boundary the beat restarts and may switch interval, with probability falling
/// exponentially in the relative tempo change — madmom's
/// `exponential_transition`, `exp(-λ · |to/from − 1|)`, row-normalised.
struct BeatTransitionModel {
    destination_offsets: Vec<u32>,
    sources: Vec<u32>,
    probabilities: Vec<f32>,
}

impl BeatTransitionModel {
    #[allow(clippy::cast_possible_truncation)]
    fn new(space: &BeatStateSpace) -> Self {
        let num_states = space.num_states();
        let mut by_destination: Vec<Vec<(u32, f32)>> = vec![Vec::new(); num_states];

        // Every state except the first of a loop is reached from its predecessor
        // at the same tempo, with certainty.
        let mut is_first = vec![false; num_states];
        for &first in &space.first_states {
            is_first[first] = true;
        }
        for (state, (entries, &first)) in
            by_destination.iter_mut().zip(is_first.iter()).enumerate()
        {
            if !first {
                entries.push(((state - 1) as u32, 1.0));
            }
        }

        for &from_state in &space.last_states {
            let from_interval = f64::from(space.state_intervals[from_state]);
            let row: Vec<f64> = space
                .first_states
                .iter()
                .map(|&to_state| {
                    let ratio = f64::from(space.state_intervals[to_state]) / from_interval;
                    let probability = (-TRANSITION_LAMBDA * (ratio - 1.0).abs()).exp();
                    if probability <= TRANSITION_THRESHOLD { 0.0 } else { probability }
                })
                .collect();

            let total: f64 = row.iter().sum();
            if total <= 0.0 {
                continue;
            }
            for (to_index, &probability) in row.iter().enumerate() {
                if probability > 0.0 {
                    let to_state = space.first_states[to_index];
                    by_destination[to_state]
                        .push((from_state as u32, (probability / total) as f32));
                }
            }
        }

        let mut destination_offsets = Vec::with_capacity(num_states + 1);
        let mut sources = Vec::new();
        let mut probabilities = Vec::new();
        for entries in &by_destination {
            destination_offsets.push(sources.len() as u32);
            for &(source, probability) in entries {
                sources.push(source);
                probabilities.push(probability);
            }
        }
        destination_offsets.push(sources.len() as u32);

        Self { destination_offsets, sources, probabilities }
    }
}

/// Online DBN beat tracker: madmom's `DBNBeatTrackingProcessor(online=True)`.
///
/// The forward algorithm maintains a distribution over states; the most likely
/// state at each frame decides whether that frame is a beat and, through its
/// interval, what the current tempo is.
struct DbnBeatTracker {
    space: BeatStateSpace,
    transitions: BeatTransitionModel,
    is_beat_state: Vec<bool>,
    forward: Vec<f32>,
    next: Vec<f32>,
}

impl DbnBeatTracker {
    fn new(min_interval: f64, max_interval: f64) -> Self {
        let space = BeatStateSpace::new(min_interval, max_interval);
        let transitions = BeatTransitionModel::new(&space);
        let num_states = space.num_states();

        #[allow(clippy::cast_possible_truncation)]
        let border = (1.0 / OBSERVATION_LAMBDA) as f32;
        let is_beat_state = space.state_positions.iter().map(|&p| p < border).collect();

        #[allow(clippy::cast_precision_loss)]
        let uniform = 1.0 / num_states as f32;
        Self {
            space,
            transitions,
            is_beat_state,
            forward: vec![uniform; num_states],
            next: vec![0.0; num_states],
        }
    }

    /// Advances one frame. Returns the beat interval in frames when the most
    /// likely state falls inside a beat.
    fn process(&mut self, activation: f32) -> Option<u32> {
        #[allow(clippy::cast_possible_truncation)]
        let non_beat_density = (1.0 - activation) / (OBSERVATION_LAMBDA as f32 - 1.0);

        let mut total = 0.0_f32;
        for (state, slot) in self.next.iter_mut().enumerate() {
            let start = self.transitions.destination_offsets[state] as usize;
            let end = self.transitions.destination_offsets[state + 1] as usize;
            let incoming: f32 = (start..end)
                .map(|edge| {
                    self.forward[self.transitions.sources[edge] as usize]
                        * self.transitions.probabilities[edge]
                })
                .sum();
            let density = if self.is_beat_state[state] { activation } else { non_beat_density };
            *slot = incoming * density;
            total += *slot;
        }

        // The forward variable shrinks by roughly the observation likelihood
        // each frame, so it must be renormalised to stay in range. If it has
        // collapsed entirely, restart from a uniform belief rather than divide
        // by zero.
        if total > 0.0 {
            for value in &mut self.next {
                *value /= total;
            }
        } else {
            #[allow(clippy::cast_precision_loss)]
            let uniform = 1.0 / self.next.len() as f32;
            self.next.fill(uniform);
        }
        std::mem::swap(&mut self.forward, &mut self.next);

        let best = self
            .forward
            .iter()
            .enumerate()
            .fold((0_usize, f32::NEG_INFINITY), |best, (state, &value)| {
                if value > best.1 { (state, value) } else { best }
            })
            .0;

        self.is_beat_state[best].then(|| self.space.state_intervals[best])
    }
}

// ---------------------------------------------------------------------------
// Tempo and phase fit
// ---------------------------------------------------------------------------

/// Number of recent beats the tempo/phase fit spans.
const FIT_CAPACITY: usize = 8;
/// Beats needed before the fit is preferred over the DBN's own interval.
const FIT_MIN_BEATS: usize = 4;
/// Gap, in beats, beyond which the fit is considered broken and restarted.
const FIT_MAX_GAP_BEATS: f64 = 4.0;
/// How far the fitted beat length may stray from the decoder's own interval
/// before the fit is discarded as having been thrown off by an outlier.
const FIT_TOLERANCE: f64 = 0.15;

/// Least-squares fit of beat time against beat index over the recent past.
///
/// The DBN's interval is quantised to whole frames, which at 100 fps is about
/// 2.4 BPM near 120 BPM — coarse enough that the free-running beat clock in the
/// render engine would visibly drift between updates. Fitting a line through the
/// beats the DBN has already committed to recovers sub-frame resolution without
/// reopening the tempo decision.
struct BeatFit {
    times_ms: Vec<f64>,
    indices: Vec<f64>,
    next_index: f64,
}

impl BeatFit {
    fn new() -> Self {
        Self { times_ms: Vec::new(), indices: Vec::new(), next_index: 0.0 }
    }

    fn reset(&mut self, time_ms: f64) {
        self.times_ms.clear();
        self.indices.clear();
        self.times_ms.push(time_ms);
        self.indices.push(0.0);
        self.next_index = 0.0;
    }

    /// Records a beat and returns the fitted beat length in ms together with
    /// the fitted time of this beat, or `None` when there are not yet enough
    /// beats to fit a line through.
    fn add(&mut self, time_ms: f64, interval_ms: f64) -> Option<(f64, f64)> {
        let Some(&last_time) = self.times_ms.last() else {
            self.reset(time_ms);
            return None;
        };

        let elapsed_beats = (time_ms - last_time) / interval_ms;
        if elapsed_beats <= 0.0 || elapsed_beats > FIT_MAX_GAP_BEATS {
            self.reset(time_ms);
            return None;
        }

        self.next_index += elapsed_beats.round().max(1.0);
        self.times_ms.push(time_ms);
        self.indices.push(self.next_index);
        if self.times_ms.len() > FIT_CAPACITY {
            self.times_ms.remove(0);
            self.indices.remove(0);
        }

        if self.times_ms.len() < FIT_MIN_BEATS {
            return None;
        }

        #[allow(clippy::cast_precision_loss)]
        let n = self.times_ms.len() as f64;
        let mean_index = self.indices.iter().sum::<f64>() / n;
        let mean_time = self.times_ms.iter().sum::<f64>() / n;
        let covariance: f64 = self
            .indices
            .iter()
            .zip(self.times_ms.iter())
            .map(|(i, t)| (i - mean_index) * (t - mean_time))
            .sum();
        let variance: f64 = self.indices.iter().map(|i| (i - mean_index).powi(2)).sum();
        if variance <= 0.0 {
            return None;
        }

        let length_ms = covariance / variance;
        let fitted_time_ms = mean_time + (self.next_index - mean_index) * length_ms;
        Some((length_ms, fitted_time_ms))
    }
}

// ---------------------------------------------------------------------------
// BeatTracker
// ---------------------------------------------------------------------------

/// Streaming beat tracker: audio in, [`BeatMetadata`] out.
///
/// Samples are accumulated into 100 fps analysis frames, turned into a beat
/// activation, and decoded by the DBN. Every decoded beat updates a tempo and
/// phase fit over the recent past, which is what the render engine's beat clock
/// is driven from.
pub struct BeatTracker {
    odf: SuperFluxOdf,
    scaler: ActivationScaler,
    dbn: DbnBeatTracker,
    fit: BeatFit,
    /// Rolling analysis window; the newest `hop_size` samples are the ones not
    /// yet seen by the ODF.
    window: Vec<f32>,
    window_fill: usize,
    hop_size: usize,
    sample_rate: u32,
    last_beat_ms: Option<f64>,
    min_interval_ms: f64,
}

impl BeatTracker {
    #[must_use]
    #[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    pub fn new(sample_rate: u32) -> Self {
        let hop_size = (f64::from(sample_rate) / FPS).round().max(1.0) as usize;
        let min_interval = 60.0 * FPS / MAX_BPM;
        let max_interval = 60.0 * FPS / MIN_BPM;

        Self {
            odf: SuperFluxOdf::new(sample_rate, hop_size),
            scaler: ActivationScaler::new(),
            dbn: DbnBeatTracker::new(min_interval, max_interval),
            fit: BeatFit::new(),
            window: vec![0.0; FRAME_SIZE],
            window_fill: 0,
            hop_size,
            sample_rate,
            last_beat_ms: None,
            min_interval_ms: 60_000.0 / MAX_BPM,
        }
    }

    /// Feeds a block of mono samples whose last sample was captured at
    /// `now_ms`, and returns updated beat metadata if a beat was decoded.
    ///
    /// A block may cover several analysis frames, so each frame's timestamp is
    /// derived from its position in the block rather than from `now_ms`
    /// directly.
    #[allow(clippy::cast_precision_loss)]
    pub fn push_samples(&mut self, samples: &[f32], now_ms: u64) -> Option<BeatMetadata> {
        let ms_per_sample = 1000.0 / f64::from(self.sample_rate);
        let mut result = None;

        for (index, &sample) in samples.iter().enumerate() {
            self.window[self.window_fill] = sample;
            self.window_fill += 1;
            if self.window_fill < self.window.len() {
                continue;
            }

            let samples_after = (samples.len() - 1 - index) as f64;
            // The analysis window looks backwards from this sample, but madmom
            // centres its frames, so the onset it describes sits half a window
            // earlier than the newest sample in it.
            let frame_centre_ms = now_ms as f64
                - samples_after * ms_per_sample
                - (FRAME_SIZE as f64 / 2.0) * ms_per_sample;

            if let Some(beat) = self.process_frame(frame_centre_ms) {
                result = Some(beat);
            }

            self.window.copy_within(self.hop_size.., 0);
            self.window_fill = self.window.len() - self.hop_size;
        }

        result
    }

    fn process_frame(&mut self, frame_centre_ms: f64) -> Option<BeatMetadata> {
        #[allow(clippy::cast_precision_loss)]
        let rms =
            (self.window.iter().map(|s| s * s).sum::<f32>() / self.window.len() as f32).sqrt();

        let activation = if rms < SILENCE_RMS {
            // Freeze the onset statistics through silence so the detector keeps
            // the scale it learned from the music, and drop the frame history so
            // the first frame after the gap is not differenced against whatever
            // was playing before it. The DBN keeps coasting on its transition
            // model in the meantime.
            self.odf.reset();
            ACT_MIN
        } else {
            let odf = self.odf.process(&self.window);
            self.scaler.scale(odf)
        };

        let interval_frames = self.dbn.process(activation)?;
        let interval_ms = f64::from(interval_frames) * 1000.0 / FPS;

        // The forward algorithm reports every frame whose most likely state sits
        // inside the beat window, which is several frames per beat. Keep the
        // first and drop the rest, as madmom's online path does.
        if let Some(last) = self.last_beat_ms
            && frame_centre_ms - last < self.min_interval_ms
        {
            return None;
        }
        self.last_beat_ms = Some(frame_centre_ms);

        // Withholding the estimate until the fit has enough beats also covers
        // the decoder's warm-up, where the state distribution is still near
        // uniform and its most likely state says nothing about the music.
        let (fitted, fitted_time) = self.fit.add(frame_centre_ms, interval_ms)?;
        let (length_ms, beat_ms) =
            if (fitted - interval_ms).abs() <= interval_ms * FIT_TOLERANCE {
                (fitted, fitted_time)
            } else {
                (interval_ms, frame_centre_ms)
            };

        // Anchoring the grid on this beat makes it beat zero; the render engine
        // realigns the beat count when it applies the transition.
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let offset_ms = beat_ms.round().max(0.0) as u64;

        Some(BeatMetadata { length_ms, offset_ms })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_RATE: u32 = 44_100;

    /// Renders a click track: a short decaying burst of broadband noise every
    /// `beat_ms`, which is the kind of broadband transient the onset function is
    /// built to fire on.
    #[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    fn click_track(beat_ms: f64, duration_ms: f64) -> Vec<f32> {
        let total = (duration_ms * f64::from(SAMPLE_RATE) / 1000.0) as usize;
        let period = beat_ms * f64::from(SAMPLE_RATE) / 1000.0;
        let decay = 0.02 * f64::from(SAMPLE_RATE);
        let mut noise = 0x1234_5678_u32;
        (0..total)
            .map(|i| {
                noise = noise.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                let sample = (noise >> 16) as f32 / 65_536.0 - 0.5;
                let envelope = (-((i as f64) % period) / decay).exp() as f32;
                sample * envelope * 2.0
            })
            .collect()
    }

    /// Feeds `samples` through a tracker in realtime-sized blocks, returning
    /// every beat estimate as (time in ms, BPM).
    #[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    fn track(samples: &[f32]) -> Vec<(u64, f64)> {
        const BLOCK: usize = 512;
        let mut tracker = BeatTracker::new(SAMPLE_RATE);
        let mut beats = Vec::new();
        for (index, block) in samples.chunks(BLOCK).enumerate() {
            let elapsed_samples = (index * BLOCK + block.len()) as f64;
            let now_ms = (elapsed_samples * 1000.0 / f64::from(SAMPLE_RATE)) as u64;
            if let Some(beat) = tracker.push_samples(block, now_ms) {
                beats.push((now_ms, 60_000.0 / beat.length_ms));
            }
        }
        beats
    }

    #[test]
    fn state_space_matches_madmom_layout() {
        let space = BeatStateSpace::new(3.0, 5.0);
        assert_eq!(space.num_states(), 3 + 4 + 5);
        assert_eq!(space.first_states, vec![0, 3, 7]);
        assert_eq!(space.last_states, vec![2, 6, 11]);
        assert_eq!(space.state_intervals[0], 3);
        assert_eq!(space.state_intervals[11], 5);
        assert!(space.state_positions[0].abs() < 1e-6);
        assert!((space.state_positions[1] - 1.0 / 3.0).abs() < 1e-6);
        assert!(space.state_positions[7].abs() < 1e-6);
    }

    #[test]
    fn every_state_has_unit_outgoing_probability() {
        let space = BeatStateSpace::new(28.0, 60.0);
        let model = BeatTransitionModel::new(&space);

        let mut outgoing = vec![0.0_f32; space.num_states()];
        for destination in 0..space.num_states() {
            let start = model.destination_offsets[destination] as usize;
            let end = model.destination_offsets[destination + 1] as usize;
            for edge in start..end {
                outgoing[model.sources[edge] as usize] += model.probabilities[edge];
            }
        }
        for (state, total) in outgoing.iter().enumerate() {
            assert!((total - 1.0).abs() < 1e-4, "state {state} sums to {total}");
        }
    }

    #[test]
    fn tempo_change_penalty_grows_with_the_change() {
        let space = BeatStateSpace::new(40.0, 60.0);
        let model = BeatTransitionModel::new(&space);
        let from = *space.last_states.first().expect("interval 40 is modelled");

        let probability_for = |interval: u32| -> f32 {
            let to = space
                .first_states
                .iter()
                .copied()
                .find(|&state| space.state_intervals[state] == interval)
                .expect("interval is modelled");
            let start = model.destination_offsets[to] as usize;
            let end = model.destination_offsets[to + 1] as usize;
            (start..end)
                .find(|&edge| model.sources[edge] as usize == from)
                .map_or(0.0, |edge| model.probabilities[edge])
        };

        assert!(probability_for(40) > probability_for(41));
        assert!(probability_for(41) > probability_for(43));
    }

    #[test]
    fn tracks_tempo_and_phase_of_a_steady_click_track() {
        const BPM: f64 = 120.0;
        const BLOCK: usize = 512;

        let beat_ms = 60_000.0 / BPM;
        let samples = click_track(beat_ms, 20_000.0);
        let mut tracker = BeatTracker::new(SAMPLE_RATE);
        let mut latest = None;
        for (index, block) in samples.chunks(BLOCK).enumerate() {
            #[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation, clippy::cast_sign_loss)]
            let now_ms =
                ((index * BLOCK + block.len()) as f64 * 1000.0 / f64::from(SAMPLE_RATE)) as u64;
            if let Some(beat) = tracker.push_samples(block, now_ms) {
                latest = Some(beat);
            }
        }

        let beat = latest.expect("tracker produced beat metadata");
        let detected = 60_000.0 / beat.length_ms;
        assert!((detected - BPM).abs() < 1.0, "expected ~{BPM} BPM, got {detected}");

        // Clicks sit on multiples of beat_ms from time zero, so the beat grid
        // should land on one of them.
        #[allow(clippy::cast_precision_loss)]
        let phase = beat.offset_ms as f64 % beat_ms;
        let error = phase.min(beat_ms - phase);
        assert!(error < 15.0, "beat grid is {error} ms off the clicks");
    }

    #[test]
    fn locks_to_the_quarter_note_against_an_eighth_note_pulse() {
        const BPM: f64 = 120.0;
        let beat_ms = 60_000.0 / BPM;

        // Accented quarters over a quieter eighth-note pulse: the arrangement
        // that invites a decoder to lock onto double time.
        let eighths = click_track(beat_ms / 2.0, 20_000.0);
        let quarters = click_track(beat_ms, 20_000.0);
        let mixed: Vec<f32> = eighths
            .iter()
            .zip(quarters.iter())
            .map(|(eighth, quarter)| eighth.mul_add(0.35, *quarter))
            .collect();

        let detected = track(&mixed).last().expect("tracker produced beats").1;
        assert!((detected - BPM).abs() < 2.0, "expected ~{BPM} BPM, got {detected}");
    }

    #[test]
    fn follows_a_tempo_change() {
        let mut samples = click_track(60_000.0 / 120.0, 18_000.0);
        samples.extend(click_track(60_000.0 / 140.0, 18_000.0));
        let beats = track(&samples);

        let before = beats
            .iter()
            .rev()
            .find(|(time, _)| *time < 18_000)
            .expect("beats before the tempo change")
            .1;
        assert!((before - 120.0).abs() < 2.0, "expected ~120 BPM, got {before}");

        let after = beats.last().expect("beats after the tempo change").1;
        assert!((after - 140.0).abs() < 2.0, "expected ~140 BPM, got {after}");
    }

    #[test]
    fn recovers_after_a_silent_passage() {
        const BPM: f64 = 120.0;
        let beat_ms = 60_000.0 / BPM;

        let mut samples = click_track(beat_ms, 15_000.0);
        samples.extend(std::iter::repeat_n(0.0_f32, SAMPLE_RATE as usize * 5));
        samples.extend(click_track(beat_ms, 15_000.0));

        let resumed: Vec<_> = track(&samples)
            .into_iter()
            .filter(|(time, _)| *time > 22_000)
            .collect();

        assert!(resumed.len() > 10, "only {} beats after silence", resumed.len());
        let detected = resumed.last().expect("beats after silence").1;
        assert!((detected - BPM).abs() < 2.0, "expected ~{BPM} BPM, got {detected}");
    }
}
