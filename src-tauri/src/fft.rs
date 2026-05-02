pub use dmx_engine::audio::AudioAnalysis;
use dmx_engine::audio::NUM_BANDS;
use rustfft::num_complex::Complex;
use rustfft::FftPlanner;
use std::f32::consts::PI;
use std::sync::Arc;

// ---------------------------------------------------------------------------
// Visualization constants
// ---------------------------------------------------------------------------

/// Treat anything below this as silence (prevents amplifying noise floor).
const ABS_DB_FLOOR: f32 = -60.0;
/// Length of the sliding window used to estimate per-band min/max.
const HISTORY_SECONDS: f32 = 2.0;
/// dB bias applied per `ln(1 + age)` when computing weighted extremes so that
/// older peaks/troughs fade toward the centre of the dynamic range.
/// 30 dB ≈ half the typical musical dynamic range.
const WINDOW_FADE_DB: f32 = 30.0;
/// EMA alpha for output smoothing — filters frame-to-frame jitter.
const EMA_ALPHA: f32 = 0.2;
/// Linear falloff per frame so values decay gracefully after transients.
const FALLOFF_PER_FRAME: f32 = 0.05;

// ---------------------------------------------------------------------------
// Signal conditioning constants (FastLED SignalConditioner)
// ---------------------------------------------------------------------------

/// Hard-clip samples beyond ±this amplitude (normalized −1.0 … 1.0).
/// Rejects I2S glitches and hardware spikes before FFT.
const SPIKE_THRESHOLD: f32 = 0.95;
/// RMS level at which the noise gate opens (hysteresis upper bound).
const GATE_OPEN_RMS: f32 = 0.005;
/// RMS level at which the noise gate closes (hysteresis lower bound).
const GATE_CLOSE_RMS: f32 = 0.003;

// ---------------------------------------------------------------------------
// Noise floor tracker constants (FastLED NoiseFloorTracker)
// ---------------------------------------------------------------------------

/// Multiplicative decay applied every frame to the estimated noise floor.
const FLOOR_DECAY: f32 = 0.993;
/// Rate at which the floor rises when the signal is consistently quiet.
const FLOOR_ATTACK: f32 = 0.005;
/// Hysteresis margin; floor can only rise after it has dropped by this much.
const FLOOR_HYSTERESIS: f32 = 0.02;
/// Frames the signal must stay below the floor before the slow attack kicks in.
const FLOOR_BELOW_FRAMES: u32 = 6;
/// Absolute minimum for the noise floor estimate (prevents division by zero).
const FLOOR_MIN: f32 = 1e-4;

// ---------------------------------------------------------------------------
// Beat detection constants (FastLED SpectralFluxDetector)
// ---------------------------------------------------------------------------

/// Adaptive threshold multiplier: onset fires when flux > mean + K·σ.
const FLUX_K: f32 = 1.5;
/// Hard minimum flux required to declare a beat regardless of the adaptive
/// threshold — prevents false positives on near-silent signals.
const FLUX_MIN_THRESHOLD: f32 = 0.005;
/// Minimum frames between consecutive beats for each detector.
/// At ~21.5 fps (44100/2048): 4 frames ≈ 186 ms.
const BEAT_COOLDOWN_FRAMES: usize = 4;

// Band ranges for per-band beat detectors.
const BASS_START: usize = 0;
const BASS_END: usize = 3; // ~40–96 Hz: kick drum, sub bass
const MID_START: usize = 4;
const MID_END: usize = 10; // ~220–1260 Hz: snare, guitar, vocals
const TREBLE_START: usize = 12;
const TREBLE_END: usize = NUM_BANDS; // ~5–20 kHz: hi-hats, cymbals

// ---------------------------------------------------------------------------
// BandHistory — unchanged from original design
// ---------------------------------------------------------------------------

/// Ring buffer of dB samples used to estimate the per-band dynamic range.
/// Older samples are biased toward the centre so stale peaks/troughs fade
/// and do not permanently anchor the normalization range.
struct BandHistory {
    samples: Vec<f32>,
    head: usize,
    /// Scale factor for the log-age bias: sized so that
    /// `bias(age = window_frames − 1) == WINDOW_FADE_DB`.
    log_bias_scale: f32,
}

impl BandHistory {
    fn new(window_frames: usize) -> Self {
        #[allow(clippy::cast_precision_loss)]
        let log_bias_scale = WINDOW_FADE_DB / (window_frames as f32).ln();
        Self {
            samples: vec![ABS_DB_FLOOR; window_frames],
            head: 0,
            log_bias_scale,
        }
    }

    fn push(&mut self, value: f32) {
        self.samples[self.head] = value;
        self.head = (self.head + 1) % self.samples.len();
    }

    /// Single-pass weighted min/max over the ring buffer.
    fn weighted_extremes(&self) -> (f32, f32) {
        let n = self.samples.len();
        let (mut min, mut max) = (f32::INFINITY, f32::NEG_INFINITY);
        for age in 0..n {
            let idx = (self.head + n - 1 - age) % n;
            #[allow(clippy::cast_precision_loss)]
            let bias = self.log_bias_scale * (1.0 + age as f32).ln();
            let v = self.samples[idx];
            if v - bias > max {
                max = v - bias;
            }
            if v + bias < min {
                min = v + bias;
            }
        }
        (min, max)
    }

    fn normalize(&self, current: f32) -> f32 {
        let (min, max) = self.weighted_extremes();
        ((current - min) / (max - min)).clamp(0.0, 1.0)
    }
}

// ---------------------------------------------------------------------------
// Peak-meter smoothing — unchanged from original design
// ---------------------------------------------------------------------------

/// Snap instantly to any value above the previous frame (so transients reach
/// full height) then decay via EMA with a linear floor.
fn smooth(raw: f32, prev: f32) -> f32 {
    if raw > prev {
        raw
    } else {
        let ema = EMA_ALPHA * raw + (1.0 - EMA_ALPHA) * prev;
        ema.max(prev - FALLOFF_PER_FRAME)
    }
}

// ---------------------------------------------------------------------------
// SignalConditioner (FastLED SignalConditioner)
// ---------------------------------------------------------------------------

/// Three-stage PCM preprocessing pipeline applied to each buffer before FFT:
///
/// 1. **DC removal** — subtracts the buffer mean so the DC bin does not bleed
///    energy into the lowest frequency bands.
/// 2. **Spike filter** — hard-clips samples beyond ±`SPIKE_THRESHOLD` to
///    reject I2S hardware glitches.
/// 3. **Noise gate** — hysteresis gate that zeroes the buffer when the RMS
///    falls below `GATE_CLOSE_RMS`, preventing noise-floor amplification.
///
/// Returns `true` when the gate is closed (frame should be treated as silent).
struct SignalConditioner {
    gate_open: bool,
}

impl SignalConditioner {
    fn new() -> Self {
        Self { gate_open: false }
    }

    fn process(&mut self, samples: &mut [f32]) -> bool {
        if samples.is_empty() {
            return true;
        }

        // DC removal: subtract the buffer mean.
        let mean = samples.iter().sum::<f32>() / samples.len() as f32;
        for s in samples.iter_mut() {
            *s -= mean;
        }

        // Spike filter: hard-clip to ±SPIKE_THRESHOLD.
        for s in samples.iter_mut() {
            *s = s.clamp(-SPIKE_THRESHOLD, SPIKE_THRESHOLD);
        }

        // Noise gate with hysteresis.
        let rms = (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt();
        if !self.gate_open && rms >= GATE_OPEN_RMS {
            self.gate_open = true;
        } else if self.gate_open && rms < GATE_CLOSE_RMS {
            self.gate_open = false;
        }

        if !self.gate_open {
            for s in samples.iter_mut() {
                *s = 0.0;
            }
            return true;
        }

        false
    }
}

// ---------------------------------------------------------------------------
// NoiseFloorTracker (FastLED NoiseFloorTracker)
// ---------------------------------------------------------------------------

/// Adaptive noise floor tracker that prevents the `BandHistory` dynamic-range
/// normalization from amplifying background noise during quiet passages.
///
/// * **Decay** — the floor drifts down slowly every frame.
/// * **Slow attack with hysteresis** — the floor rises only when the signal
///   has been consistently quiet for `FLOOR_BELOW_FRAMES` frames *and* the
///   floor has already dropped far enough from the last hysteresis anchor.
///   This prevents the floor from chasing transient noise spikes.
struct NoiseFloorTracker {
    floor: f32,
    below_count: u32,
    last_hysteresis_floor: f32,
}

impl NoiseFloorTracker {
    fn new() -> Self {
        Self {
            floor: 0.05,
            below_count: 0,
            last_hysteresis_floor: 0.0,
        }
    }

    /// Update the floor with the current normalised signal level (0 … 1).
    fn update(&mut self, level: f32) {
        self.floor = (self.floor * FLOOR_DECAY).max(FLOOR_MIN);

        if level > self.floor {
            self.below_count = 0;
        } else {
            self.below_count = self.below_count.saturating_add(1);
            if self.below_count > FLOOR_BELOW_FRAMES {
                if self.floor - level > FLOOR_HYSTERESIS {
                    self.last_hysteresis_floor = self.floor;
                }
                if self.floor > self.last_hysteresis_floor - FLOOR_HYSTERESIS {
                    self.floor += (level - self.floor) * FLOOR_ATTACK;
                }
            }
        }
    }

    /// Returns `true` when the signal is meaningfully above the noise floor.
    fn is_above(&self, level: f32) -> bool {
        level > self.floor + FLOOR_HYSTERESIS
    }
}

// ---------------------------------------------------------------------------
// SpectralFluxDetector (FastLED SpectralFluxDetector)
// ---------------------------------------------------------------------------

/// Half-wave-rectified spectral flux onset detector with adaptive threshold.
///
/// Each call to `detect` computes the sum of *positive* magnitude differences
/// between the current and previous frame for a configurable slice of frequency
/// bands. An onset is declared when:
///
/// * flux > mean + `FLUX_K` · σ of a rolling 2-second flux history, AND
/// * at least `BEAT_COOLDOWN_FRAMES` frames have elapsed since the last beat.
///
/// The adaptive threshold scales automatically with the signal level so no
/// manual gain calibration is needed. `FLUX_MIN_THRESHOLD` provides a hard
/// floor to suppress noise-floor artifacts on near-silent signals.
struct SpectralFluxDetector {
    previous: [f32; NUM_BANDS],
    history: Vec<f32>,
    history_idx: usize,
    band_start: usize,
    band_end: usize,
    frames_since_beat: usize,
}

impl SpectralFluxDetector {
    fn new(history_len: usize, band_start: usize, band_end: usize) -> Self {
        Self {
            previous: [0.0; NUM_BANDS],
            history: vec![0.0; history_len],
            history_idx: 0,
            band_start,
            band_end: band_end.min(NUM_BANDS),
            frames_since_beat: 0,
        }
    }

    /// Feed current linear-amplitude band values; returns `true` on an onset.
    ///
    /// Only the bands in `[band_start, band_end)` contribute to the flux and
    /// are updated in `previous`. Each detector instance is fully independent.
    fn detect(&mut self, current: &[f32; NUM_BANDS]) -> bool {
        // Half-wave rectified spectral flux over the configured band range.
        let flux: f32 = (self.band_start..self.band_end)
            .map(|i| (current[i] - self.previous[i]).max(0.0))
            .sum();

        // Push flux into the rolling history ring buffer.
        self.history[self.history_idx] = flux;
        self.history_idx = (self.history_idx + 1) % self.history.len();

        // Adaptive threshold: mean + FLUX_K · std_dev, floored at FLUX_MIN_THRESHOLD.
        #[allow(clippy::cast_precision_loss)]
        let n = self.history.len() as f32;
        let mean: f32 = self.history.iter().sum::<f32>() / n;
        let variance: f32 = self.history.iter().map(|x| (x - mean).powi(2)).sum::<f32>() / n;
        let threshold = (mean + FLUX_K * variance.sqrt()).max(FLUX_MIN_THRESHOLD);

        // Update the previous frame for this band slice.
        self.previous[self.band_start..self.band_end]
            .copy_from_slice(&current[self.band_start..self.band_end]);

        self.frames_since_beat = self.frames_since_beat.saturating_add(1);

        if flux > threshold && self.frames_since_beat >= BEAT_COOLDOWN_FRAMES {
            self.frames_since_beat = 0;
            return true;
        }

        false
    }
}

// ---------------------------------------------------------------------------
// FftAnalyzer
// ---------------------------------------------------------------------------

/// Accumulates audio samples and produces frequency-band analysis via FFT.
///
/// ## Visualization pipeline
///
/// 1. **Signal conditioning** — DC removal, spike filter, noise gate.
/// 2. **FFT** with Hann window on each complete frame.
/// 3. **Band peak extraction** — peak magnitude² per logarithmic band.
/// 4. **dB conversion** and push into per-band `BandHistory`.
/// 5. **Dynamic-range normalization** via the weighted sliding window.
/// 6. **Silence gating** — output forced to 0 when the gate is closed or the
///    signal is below the noise floor, preventing history amplification.
/// 7. **EMA + falloff smoothing** for visual continuity.
///
/// ## Beat detection pipeline (FastLED-inspired)
///
/// Beat detection runs on raw linear amplitudes (before dB compression) so
/// sudden energy increases are not flattened by the log scale. Four
/// independent `SpectralFluxDetector` instances monitor:
///
/// * **Full** — all 16 bands (general onset).
/// * **Bass** — bands 0-2 (~40–96 Hz): kick drum, sub bass.
/// * **Mid** — bands 4-9 (~220–1260 Hz): snare, guitar, vocals.
/// * **Treble** — bands 12-15 (~5–20 kHz): hi-hats, cymbals.
///
/// Each detector uses adaptive thresholding (mean + 1.5 σ over a 2-second
/// flux history) and per-detector cooldown to prevent double-triggering.
/// Detectors are not called during silent frames, so their state is preserved
/// across silence gaps.
pub struct FftAnalyzer {
    fft_size: usize,
    sample_rate: u32,
    buffer: Vec<f32>,
    buffer_pos: usize,
    window: Vec<f32>,
    fft_input: Vec<Complex<f32>>,
    planner_scratch: Vec<Complex<f32>>,
    fft: Arc<dyn rustfft::Fft<f32>>,
    /// 17 edges defining 16 logarithmically-spaced frequency bands.
    band_edges: [f32; NUM_BANDS + 1],
    band_histories: [BandHistory; NUM_BANDS],
    all_history: BandHistory,
    prev_bands: [f32; NUM_BANDS],
    prev_all: f32,
    conditioner: SignalConditioner,
    noise_floor: NoiseFloorTracker,
    beat_full: SpectralFluxDetector,
    beat_bass: SpectralFluxDetector,
    beat_mid: SpectralFluxDetector,
    beat_treble: SpectralFluxDetector,
}

impl FftAnalyzer {
    pub fn new(fft_size: usize, sample_rate: u32) -> Self {
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(fft_size);
        let scratch_len = fft.get_inplace_scratch_len();

        // Hann window.
        let window: Vec<f32> = (0..fft_size)
            .map(|i| {
                #[allow(clippy::cast_precision_loss)]
                let x = 2.0 * PI * i as f32 / (fft_size - 1) as f32;
                0.5 * (1.0 - x.cos())
            })
            .collect();

        // Logarithmic band edges 40 Hz → 20 kHz: edge[i] = 40 · 500^(i/16).
        let mut band_edges = [0.0_f32; NUM_BANDS + 1];
        #[allow(clippy::cast_precision_loss)]
        for (i, edge) in band_edges.iter_mut().enumerate() {
            *edge = 40.0 * 500.0_f32.powf(i as f32 / NUM_BANDS as f32);
        }

        #[allow(clippy::cast_precision_loss)]
        let frame_rate = sample_rate as f32 / fft_size as f32;

        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let window_frames = (HISTORY_SECONDS * frame_rate).ceil() as usize;

        // 2-second flux history for adaptive beat thresholding.
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let flux_history_len = (2.0 * frame_rate).ceil() as usize;

        Self {
            fft_size,
            sample_rate,
            buffer: vec![0.0; fft_size],
            buffer_pos: 0,
            window,
            fft_input: vec![Complex::new(0.0, 0.0); fft_size],
            planner_scratch: vec![Complex::new(0.0, 0.0); scratch_len],
            fft,
            band_edges,
            band_histories: std::array::from_fn(|_| BandHistory::new(window_frames)),
            all_history: BandHistory::new(window_frames),
            prev_bands: [0.0; NUM_BANDS],
            prev_all: 0.0,
            conditioner: SignalConditioner::new(),
            noise_floor: NoiseFloorTracker::new(),
            beat_full: SpectralFluxDetector::new(flux_history_len, 0, NUM_BANDS),
            beat_bass: SpectralFluxDetector::new(flux_history_len, BASS_START, BASS_END),
            beat_mid: SpectralFluxDetector::new(flux_history_len, MID_START, MID_END),
            beat_treble: SpectralFluxDetector::new(flux_history_len, TREBLE_START, TREBLE_END),
        }
    }

    /// Feed a mono sample into the analyzer. Returns analysis when a full
    /// FFT frame is ready (every `fft_size` samples).
    #[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation)]
    pub fn push_sample(&mut self, sample: f32) -> Option<AudioAnalysis> {
        self.buffer[self.buffer_pos] = sample;
        self.buffer_pos += 1;

        if self.buffer_pos < self.fft_size {
            return None;
        }
        self.buffer_pos = 0;

        // 1. Signal conditioning (DC removal + spike filter + noise gate).
        let gate_closed = self.conditioner.process(&mut self.buffer);

        // 2. FFT with Hann window.
        for (out, (&s, &w)) in self
            .fft_input
            .iter_mut()
            .zip(self.buffer.iter().zip(self.window.iter()))
        {
            *out = Complex::new(s * w, 0.0);
        }
        self.fft
            .process_with_scratch(&mut self.fft_input, &mut self.planner_scratch);

        // 3. Per-band peak magnitude² (positive frequencies only).
        let half = self.fft_size / 2;
        let bin_hz = self.sample_rate as f32 / self.fft_size as f32;
        let fft_size_f = self.fft_size as f32;

        let mut band_peaks_sq = [0.0_f32; NUM_BANDS];
        let mut all_peak_sq: f32 = 0.0;

        for (i, c) in self.fft_input.iter().enumerate().take(half) {
            let freq = i as f32 * bin_hz;
            let mag_sq = c.norm_sqr();

            if mag_sq > all_peak_sq {
                all_peak_sq = mag_sq;
            }
            let band = self.band_edges.partition_point(|&edge| edge <= freq);
            if band > 0 && band <= NUM_BANDS && band_peaks_sq[band - 1] < mag_sq {
                band_peaks_sq[band - 1] = mag_sq;
            }
        }

        // 4. dB conversion (shared closure, captures fft_size_f).
        let to_db = |peak_sq: f32| -> f32 {
            let amplitude = peak_sq.sqrt() / fft_size_f;
            if amplitude <= 0.0 {
                return ABS_DB_FLOOR;
            }
            (20.0 * amplitude.log10()).max(ABS_DB_FLOOR)
        };

        let db_all = to_db(all_peak_sq);
        let db_bands = band_peaks_sq.map(to_db);

        // 5. Noise floor tracking on the normalised overall dB level (0 … 1).
        // Maps ABS_DB_FLOOR → 0 and 0 dBFS → 1.
        let level_norm = ((db_all - ABS_DB_FLOOR) / (-ABS_DB_FLOOR)).clamp(0.0, 1.0);
        self.noise_floor.update(level_norm);
        let above_floor = self.noise_floor.is_above(level_norm);

        // A frame is "effectively silent" if the noise gate is closed or the
        // signal has not risen above the adaptive noise floor.
        let effective_silent = gate_closed || !above_floor;

        // 6. Beat detection on raw linear amplitudes (pre-dB, pre-normalization).
        // Detectors are skipped — and their state preserved — during silence.
        let raw_bands: [f32; NUM_BANDS] = band_peaks_sq.map(|sq| sq.sqrt() / fft_size_f);
        let beat = !effective_silent && self.beat_full.detect(&raw_bands);
        let beat_bass = !effective_silent && self.beat_bass.detect(&raw_bands);
        let beat_mid = !effective_silent && self.beat_mid.detect(&raw_bands);
        let beat_treble = !effective_silent && self.beat_treble.detect(&raw_bands);

        // 7. BandHistory normalization and EMA+falloff smoothing.
        let mut bands = [0.0_f32; NUM_BANDS];
        for i in 0..NUM_BANDS {
            self.band_histories[i].push(db_bands[i]);
            let normalized = if effective_silent {
                0.0
            } else {
                self.band_histories[i].normalize(db_bands[i])
            };
            bands[i] = smooth(normalized, self.prev_bands[i]);
        }

        self.all_history.push(db_all);
        let all_normalized = if effective_silent {
            0.0
        } else {
            self.all_history.normalize(db_all)
        };
        let all = smooth(all_normalized, self.prev_all);

        self.prev_bands = bands;
        self.prev_all = all;

        Some(AudioAnalysis {
            bands,
            all,
            beat,
            beat_bass,
            beat_mid,
            beat_treble,
            calculated_at_ms: 0,
        })
    }
}
