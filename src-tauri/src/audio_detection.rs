//! BeatNet-inspired beat detection using spectral-flux onset detection and a
//! particle filter for beat / tempo tracking.
//!
//! Key improvements over a simple energy-based approach:
//!
//! * **STFT spectral flux** – captures transient onset events far more
//!   accurately than raw RMS energy.  We compute per-hop differences of a
//!   24-band log mel spectrogram, which isolates percussive attacks while
//!   ignoring sustained notes.
//!
//! * **Mel filterbank** – 24 triangular filters covering 30 Hz – 17 kHz give
//!   perceptually-weighted frequency resolution that matches human pitch
//!   perception.
//!
//! * **Particle filter beat tracker** – 1 500 particles each carry a (phase,
//!   tempo) state.  After the STFT onset function exceeds an adaptive
//!   threshold, particles are weighted by whether they predicted a beat at
//!   that moment; otherwise the particles free-run, preserving the current
//!   tempo estimate.  This allows beats to be tracked reliably even when
//!   individual onsets are weak.
//!
//! Reference: Heydari et al., "BeatNet: CRNN and Particle Filtering for
//! Online Joint Beat/Downbeat/Tempo/Meter Tracking", ISMIR 2021.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{BufferSize, Device, SampleFormat, StreamConfig, StreamError};
use rustfft::{FftPlanner, num_complex::Complex};
use std::collections::{BTreeMap, VecDeque};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread::{self, JoinHandle};

// ── STFT / MEL PARAMETERS ───────────────────────────────────────────────────

/// FFT window size.  1 024 samples ≈ 23 ms at 44.1 kHz.
const FFT_SIZE: usize = 1_024;

/// Hop size (50 % overlap → ≈ 11.6 ms per hop at 44.1 kHz, ~86 hops/s).
const HOP_SIZE: usize = 512;

/// Number of triangular mel filterbank bands.
const MEL_BANDS: usize = 24;

/// Lower frequency bound for the mel filterbank (Hz).
const FREQ_MIN: f64 = 30.0;

/// Upper frequency bound for the mel filterbank (Hz).
const FREQ_MAX: f64 = 17_000.0;

// ── ONSET DETECTION PARAMETERS ──────────────────────────────────────────────

/// Length of the rolling onset-strength history used for adaptive
/// thresholding.  At ~86 hops/s this covers ≈ 1.2 s.
const ONSET_HISTORY_LEN: usize = 100;

/// Onset peak threshold: `mean + ONSET_THRESHOLD_SIGMA × σ`.
const ONSET_THRESHOLD_SIGMA: f64 = 1.5;

/// Absolute minimum onset strength (silence guard).
const MIN_ONSET_STRENGTH: f64 = 1e-4;

// ── PARTICLE FILTER PARAMETERS ──────────────────────────────────────────────

/// Number of beat-tracking particles.
const N_PARTICLES: usize = 1_500;

/// Lowest detectable tempo (BPM).
const TEMPO_MIN_BPM: f64 = 55.0;

/// Highest detectable tempo (BPM).
const TEMPO_MAX_BPM: f64 = 215.0;

/// Baseline observation weight; prevents any particle from reaching weight 0.
const WEIGHT_BASELINE: f64 = 0.03;

/// Half-width of the "beat boundary region" expressed as a fraction of one
/// beat.  Particles whose phase falls within this window of 0 are rewarded
/// by the onset observation.
const BEAT_REGION_WIDTH: f64 = 0.07;

/// Per-resample tempo jitter standard deviation (in hops).
const TEMPO_SIGMA: f64 = 0.4;

/// Minimum interval between two emitted beat events (ms).
const MIN_BEAT_INTERVAL_MS: f64 = 250.0;

/// Minimum fraction of total particle weight that must be within the beat
/// boundary region for a beat to be confirmed.
const BEAT_WEIGHT_THRESHOLD: f64 = 0.15;

// ── PUBLIC API ───────────────────────────────────────────────────────────────

/// Starts recording from `device` on a new thread and calls `on_beat` each
/// time a beat is detected.  Returns a join handle for the recording thread.
///
/// Set `keep_recording` to `false` to stop the thread.
pub(crate) fn start_listening(
    on_beat: impl Fn() + Send + 'static,
    device: Device,
    keep_recording: Arc<AtomicBool>,
) -> Result<JoinHandle<()>, String> {
    let config = device
        .default_input_config()
        .map_err(|e| format!("Failed to get default input config: {e}"))?;

    let sample_rate = config.sample_rate().0;
    let sample_format = config.sample_format();
    let channels = config.channels();

    log::info!(
        "Audio beat detection: device={:?}, rate={sample_rate}, \
         format={sample_format:?}, channels={channels}",
        device.name().unwrap_or_else(|_| "unknown".into()),
    );

    let stream_config = StreamConfig {
        channels,
        sample_rate: config.sample_rate(),
        buffer_size: BufferSize::Fixed(1_024),
    };

    let handle = thread::spawn(move || {
        let detector = BeatNetDetector::new(sample_rate, channels);

        let err_cb = |err: StreamError| {
            log::error!("Audio input stream error: {err}");
        };

        let stream_result = match sample_format {
            SampleFormat::F32 => device.build_input_stream(
                &stream_config,
                move |data: &[f32], _| {
                    if detector.process_f32(data) {
                        on_beat();
                    }
                },
                err_cb,
            ),
            SampleFormat::I16 => device.build_input_stream(
                &stream_config,
                move |data: &[i16], _| {
                    if detector.process_i16(data) {
                        on_beat();
                    }
                },
                err_cb,
            ),
            SampleFormat::U16 => device.build_input_stream(
                &stream_config,
                move |data: &[u16], _| {
                    if detector.process_u16(data) {
                        on_beat();
                    }
                },
                err_cb,
            ),
        };

        let stream = match stream_result {
            Ok(s) => s,
            Err(e) => {
                log::error!("Failed to build audio input stream: {e}");
                return;
            }
        };

        if let Err(e) = stream.play() {
            log::error!("Failed to start audio input stream: {e}");
            return;
        }

        log::info!("Audio input stream started");

        while keep_recording.load(Ordering::Relaxed) {
            thread::park_timeout(std::time::Duration::from_millis(100));
        }

        drop(stream);
        log::info!("Audio input stream stopped");
    });

    Ok(handle)
}

/// Returns a map of device name → [`Device`] for all available audio inputs.
pub(crate) fn audio_input_device_list() -> BTreeMap<String, Device> {
    let host = cpal::default_host();
    let mut map = BTreeMap::new();
    if let Ok(devices) = host.input_devices() {
        for (i, dev) in devices.enumerate() {
            let name = dev
                .name()
                .unwrap_or_else(|_| format!("Unknown device #{i}"));
            map.insert(name, dev);
        }
    }
    map
}

// ── MEL FILTERBANK ───────────────────────────────────────────────────────────

fn hz_to_mel(hz: f64) -> f64 {
    2_595.0 * (1.0 + hz / 700.0).log10()
}

fn mel_to_hz(mel: f64) -> f64 {
    700.0 * (10_f64.powf(mel / 2_595.0) - 1.0)
}

/// Builds a sparse mel filterbank: 24 triangular filters over 30 Hz – 17 kHz.
///
/// Each filter is stored as `Vec<(fft_bin, weight)>` covering only the
/// non-zero region of the triangle, saving compute at runtime.
fn build_mel_filterbank(sample_rate: f64) -> Vec<Vec<(usize, f64)>> {
    let n_bins = FFT_SIZE / 2 + 1;
    let mel_min = hz_to_mel(FREQ_MIN);
    let mel_max = hz_to_mel(FREQ_MAX.min(sample_rate / 2.0));
    let freq_per_bin = sample_rate / FFT_SIZE as f64;

    // MEL_BANDS + 2 boundary points equally spaced in mel space.
    let edges: Vec<usize> = (0..=(MEL_BANDS + 1))
        .map(|i| {
            let mel = mel_min + (mel_max - mel_min) * i as f64 / (MEL_BANDS + 1) as f64;
            let hz = mel_to_hz(mel);
            ((hz / freq_per_bin).round() as usize).clamp(0, n_bins - 1)
        })
        .collect();

    (0..MEL_BANDS)
        .map(|b| {
            let left = edges[b];
            let center = edges[b + 1];
            let right = edges[b + 2];
            let mut filter: Vec<(usize, f64)> = Vec::new();

            // Rising slope: left → center.
            if center > left {
                for bin in left..=center {
                    let w = (bin - left) as f64 / (center - left) as f64;
                    if w > 0.0 {
                        filter.push((bin, w));
                    }
                }
            }
            // Falling slope: center+1 → right.
            if right > center {
                for bin in (center + 1)..=right {
                    let w = (right - bin) as f64 / (right - center) as f64;
                    if w > 0.0 {
                        filter.push((bin, w));
                    }
                }
            }
            filter
        })
        .collect()
}

// ── LIGHTWEIGHT PRNG (XorShift-64) ──────────────────────────────────────────

/// A simple XorShift-64 PRNG used for particle filter initialisation and
/// resampling jitter.  Avoids an external `rand` dependency.
struct Xorshift64 {
    state: u64,
}

impl Xorshift64 {
    fn new(seed: u64) -> Self {
        Self {
            state: if seed == 0 { 0xBAD5EED } else { seed },
        }
    }

    /// Uniformly distributed `f64` in `[0, 1)`.
    fn next_f64(&mut self) -> f64 {
        self.state ^= self.state << 13;
        self.state ^= self.state >> 7;
        self.state ^= self.state << 17;
        (self.state >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }

    /// Normally distributed `f64` via the Box–Muller transform.
    fn next_normal(&mut self) -> f64 {
        let u1 = self.next_f64().max(1e-10);
        let u2 = self.next_f64();
        (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos()
    }
}

// ── PARTICLE FILTER ──────────────────────────────────────────────────────────

#[derive(Clone)]
struct Particle {
    /// Beat phase ∈ [0, 1).  0 = beat boundary; increases until the next beat.
    phase: f64,
    /// Beat period in hops (inversely proportional to tempo).
    period_hops: f64,
    /// Normalised particle weight.
    weight: f64,
}

struct BeatParticleFilter {
    particles: Vec<Particle>,
    min_period: f64,
    max_period: f64,
}

impl BeatParticleFilter {
    fn new(min_period: f64, max_period: f64, rng: &mut Xorshift64) -> Self {
        let uniform = 1.0 / N_PARTICLES as f64;
        let particles = (0..N_PARTICLES)
            .map(|_| Particle {
                phase: rng.next_f64(),
                period_hops: min_period + rng.next_f64() * (max_period - min_period),
                weight: uniform,
            })
            .collect();
        Self {
            particles,
            min_period,
            max_period,
        }
    }

    /// Advance every particle by one hop and optionally apply an onset
    /// observation.  Returns `true` if a beat is confirmed this hop.
    ///
    /// * `onset` – raw spectral-flux onset strength for this hop.
    /// * `is_peak` – `true` when `onset` exceeds the adaptive threshold.
    fn update(&mut self, onset: f64, is_peak: bool, rng: &mut Xorshift64) -> bool {
        // ── Prediction: advance phase by one hop ──────────────────────────
        for p in self.particles.iter_mut() {
            p.phase += 1.0 / p.period_hops;
            if p.phase >= 1.0 {
                p.phase -= 1.0;
            }
        }

        // ── Observation: reweight at onset peaks only ("information gate") ─
        if is_peak {
            for p in self.particles.iter_mut() {
                let in_beat_region = p.phase < BEAT_REGION_WIDTH;
                let obs = if in_beat_region {
                    // Scale observation by onset strength.
                    onset.mul_add(1.0 - WEIGHT_BASELINE, WEIGHT_BASELINE)
                } else {
                    WEIGHT_BASELINE
                };
                p.weight *= obs;
            }
            self.normalize_and_maybe_resample(rng);
        }

        // ── Beat detection: is significant weight near phase = 0? ─────────
        if !is_peak {
            return false;
        }
        let beat_weight: f64 = self
            .particles
            .iter()
            .filter(|p| p.phase < BEAT_REGION_WIDTH)
            .map(|p| p.weight)
            .sum();

        beat_weight > BEAT_WEIGHT_THRESHOLD
    }

    fn normalize_and_maybe_resample(&mut self, rng: &mut Xorshift64) {
        let total: f64 = self.particles.iter().map(|p| p.weight).sum();
        if total <= f64::EPSILON {
            // Degenerate distribution — reset to uniform.
            let uniform = 1.0 / N_PARTICLES as f64;
            for p in self.particles.iter_mut() {
                p.weight = uniform;
            }
            return;
        }
        let inv = 1.0 / total;
        for p in self.particles.iter_mut() {
            p.weight *= inv;
        }

        // Effective sample size = 1 / Σ(w²).  Resample when ESS < N/2.
        let ess_inv: f64 = self.particles.iter().map(|p| p.weight * p.weight).sum();
        if ess_inv > 2.0 / N_PARTICLES as f64 {
            self.systematic_resample(rng);
        }
    }

    /// Systematic resampling — O(N), minimal variance.
    fn systematic_resample(&mut self, rng: &mut Xorshift64) {
        let n = N_PARTICLES;

        // Build cumulative weight array.
        let mut cumsum = Vec::with_capacity(n);
        let mut acc = 0.0f64;
        for p in &self.particles {
            acc += p.weight;
            cumsum.push(acc);
        }

        let step = 1.0 / n as f64;
        let start = rng.next_f64() * step;

        let mut new_particles = Vec::with_capacity(n);
        let mut j = 0usize;

        for i in 0..n {
            let target = start + i as f64 * step;
            while j < n - 1 && cumsum[j] < target {
                j += 1;
            }
            let mut p = self.particles[j].clone();
            // Small tempo jitter maintains particle diversity.
            let jitter = TEMPO_SIGMA * rng.next_normal();
            p.period_hops = (p.period_hops + jitter).clamp(self.min_period, self.max_period);
            p.weight = 1.0 / n as f64;
            new_particles.push(p);
        }

        self.particles = new_particles;
    }
}

// ── INTERNAL DETECTOR STATE ──────────────────────────────────────────────────

struct DetectorState {
    // ── Feature extraction ─────────────────────────────────────────────────
    /// Circular audio sample buffer (FFT_SIZE entries).
    audio_buf: Vec<f32>,
    /// Write position in `audio_buf`.
    buf_pos: usize,
    /// Samples accumulated since the last hop was processed.
    samples_since_hop: usize,

    /// Previous mel spectrum (for spectral-flux computation).
    prev_mel: Vec<f64>,
    /// `false` until the first mel spectrum has been computed.
    prev_mel_valid: bool,

    /// Sparse mel filterbank — built once at construction.
    mel_filterbank: Vec<Vec<(usize, f64)>>,
    /// Precomputed Hann window coefficients.
    hann_window: Vec<f64>,
    /// Reusable FFT scratch buffer.
    fft_buf: Vec<Complex<f64>>,
    /// FFT plan (reused each hop).
    fft: Arc<dyn rustfft::Fft<f64>>,

    // ── Onset detection ────────────────────────────────────────────────────
    onset_history: VecDeque<f64>,

    // ── Beat tracking ──────────────────────────────────────────────────────
    particle_filter: BeatParticleFilter,
    rng: Xorshift64,

    // ── Timing ────────────────────────────────────────────────────────────
    /// Total elapsed time in ms since the stream started.
    time_ms: f64,
    /// Time of the most recently emitted beat (ms).
    last_beat_ms: f64,
}

// ── MAIN DETECTOR ────────────────────────────────────────────────────────────

/// BeatNet-inspired beat detector.
///
/// Thread-safe via an internal `Mutex`; multiple audio-format callbacks share
/// the same state without separate instances.
struct BeatNetDetector {
    state: Mutex<DetectorState>,
    ms_per_sample: f64,
    channels: u16,
}

impl BeatNetDetector {
    fn new(sample_rate: u32, channels: u16) -> Self {
        let sr = f64::from(sample_rate);

        let hann_window: Vec<f64> = (0..FFT_SIZE)
            .map(|i| {
                0.5 * (1.0
                    - (2.0 * std::f64::consts::PI * i as f64 / (FFT_SIZE - 1) as f64).cos())
            })
            .collect();

        let mel_filterbank = build_mel_filterbank(sr);

        let min_period = 60.0 / TEMPO_MAX_BPM * sr / HOP_SIZE as f64;
        let max_period = 60.0 / TEMPO_MIN_BPM * sr / HOP_SIZE as f64;

        let mut planner: FftPlanner<f64> = FftPlanner::new();
        let fft = planner.plan_fft_forward(FFT_SIZE);

        let mut rng = Xorshift64::new(0xDEAD_BEEF_CAFE_BABE);
        let particle_filter = BeatParticleFilter::new(min_period, max_period, &mut rng);

        let state = DetectorState {
            audio_buf: vec![0.0f32; FFT_SIZE],
            buf_pos: 0,
            samples_since_hop: 0,
            prev_mel: vec![0.0f64; MEL_BANDS],
            prev_mel_valid: false,
            mel_filterbank,
            hann_window,
            fft_buf: vec![Complex::default(); FFT_SIZE],
            fft,
            onset_history: VecDeque::with_capacity(ONSET_HISTORY_LEN + 1),
            particle_filter,
            rng,
            time_ms: 0.0,
            last_beat_ms: f64::NEG_INFINITY,
        };

        Self {
            state: Mutex::new(state),
            ms_per_sample: 1_000.0 / sr,
            channels,
        }
    }

    fn process_f32(&self, data: &[f32]) -> bool {
        let ch = self.channels as usize;
        let mono: Vec<f32> = data
            .chunks_exact(ch)
            .map(|frame| frame.iter().copied().sum::<f32>() / ch as f32)
            .collect();
        self.process_mono(&mono)
    }

    fn process_i16(&self, data: &[i16]) -> bool {
        let ch = self.channels as usize;
        let scale = 1.0f32 / i16::MAX as f32;
        let mono: Vec<f32> = data
            .chunks_exact(ch)
            .map(|frame| frame.iter().map(|&s| s as f32 * scale).sum::<f32>() / ch as f32)
            .collect();
        self.process_mono(&mono)
    }

    fn process_u16(&self, data: &[u16]) -> bool {
        let ch = self.channels as usize;
        let scale = 1.0f32 / i16::MAX as f32;
        let offset = u16::MAX as f32 / 2.0;
        let mono: Vec<f32> = data
            .chunks_exact(ch)
            .map(|frame| {
                frame
                    .iter()
                    .map(|&s| (s as f32 - offset) * scale)
                    .sum::<f32>()
                    / ch as f32
            })
            .collect();
        self.process_mono(&mono)
    }

    fn process_mono(&self, mono: &[f32]) -> bool {
        let Ok(mut st) = self.state.lock() else {
            return false;
        };

        st.time_ms += mono.len() as f64 * self.ms_per_sample;
        let mut beat_detected = false;

        for &sample in mono {
            // Push sample into the circular audio buffer.
            st.audio_buf[st.buf_pos] = sample;
            st.buf_pos = (st.buf_pos + 1) % FFT_SIZE;
            st.samples_since_hop += 1;

            if st.samples_since_hop < HOP_SIZE {
                continue;
            }
            st.samples_since_hop = 0;

            // Compute spectral-flux onset strength for this hop.
            let Some(onset) = compute_onset(&mut st) else {
                continue;
            };

            // Update adaptive threshold history.
            st.onset_history.push_back(onset);
            if st.onset_history.len() > ONSET_HISTORY_LEN {
                st.onset_history.pop_front();
            }

            let is_peak = is_onset_peak(onset, &st.onset_history);

            // Run one step of the particle filter.
            let pf_beat = st.particle_filter.update(onset, is_peak, &mut st.rng);

            if pf_beat && (st.time_ms - st.last_beat_ms) >= MIN_BEAT_INTERVAL_MS {
                st.last_beat_ms = st.time_ms;
                beat_detected = true;
            }
        }

        beat_detected
    }
}

// ── ONSET COMPUTATION ────────────────────────────────────────────────────────

/// Computes the spectral-flux onset strength for the current hop.
///
/// Returns `None` on the very first call (no previous frame to diff against).
fn compute_onset(st: &mut DetectorState) -> Option<f64> {
    let n_bins = FFT_SIZE / 2 + 1;
    let inv_fft = 1.0 / FFT_SIZE as f64;
    let pos = st.buf_pos;

    // Fill the FFT scratch buffer: ordered samples (oldest → newest) ×
    // Hann window.
    for (i, cell) in st.fft_buf.iter_mut().enumerate() {
        let buf_idx = (pos + i) % FFT_SIZE;
        cell.re = f64::from(st.audio_buf[buf_idx]) * st.hann_window[i];
        cell.im = 0.0;
    }

    // In-place forward FFT.
    st.fft.process(&mut st.fft_buf);

    // Compute log-compressed mel spectrum.
    let mel_spec: Vec<f64> = st
        .mel_filterbank
        .iter()
        .map(|band| {
            let power: f64 = band
                .iter()
                .filter(|&&(bin, _)| bin < n_bins)
                .map(|&(bin, w)| st.fft_buf[bin].norm_sqr() * inv_fft * w)
                .sum();
            // log(1 + √power) — compressed magnitude, avoids log(0).
            (1.0 + power.sqrt()).ln()
        })
        .collect();

    if !st.prev_mel_valid {
        st.prev_mel.copy_from_slice(&mel_spec);
        st.prev_mel_valid = true;
        return None;
    }

    // Positive spectral flux: sum of frame-to-frame increases across bands.
    let flux: f64 = mel_spec
        .iter()
        .zip(st.prev_mel.iter())
        .map(|(&curr, &prev)| (curr - prev).max(0.0))
        .sum();

    st.prev_mel.copy_from_slice(&mel_spec);
    Some(flux)
}

/// Returns `true` when `onset` exceeds `mean + ONSET_THRESHOLD_SIGMA × σ`
/// of the recent onset history.
fn is_onset_peak(onset: f64, history: &VecDeque<f64>) -> bool {
    if onset < MIN_ONSET_STRENGTH || history.len() < 4 {
        return false;
    }
    let n = history.len() as f64;
    let mean = history.iter().sum::<f64>() / n;
    let var = history.iter().map(|&x| (x - mean).powi(2)).sum::<f64>() / n;
    let std_dev = var.sqrt();
    onset > mean + ONSET_THRESHOLD_SIGMA * std_dev
}
