pub use dmx_engine::audio::AudioAnalysis;
use dmx_engine::audio::NUM_BANDS;
use rustfft::FftPlanner;
use rustfft::num_complex::Complex;
use std::f32::consts::PI;
use std::sync::Arc;

/// Treat anything below this as silence (prevents amplifying noise).
const ABS_DB_FLOOR: f32 = -60.0;
/// Length of the sliding window used to estimate per-band min/max.
const HISTORY_SECONDS: f32 = 2.0;
/// dB applied to a sample at the oldest end of the window when computing
/// weighted max/min: each sample's effective value is biased toward the
/// centre of the dynamic range as it ages, so a stale peak loses to a
/// fresher near-peak and a stale quiet loses to a fresher near-quiet. The
/// bias grows as `ln(1 + age)`, so recent samples lose value quickly and
/// the discount plateaus near the window edge.
/// 30 dB ≈ half the typical musical dynamic range — at the window edge the
/// sample is heavily discounted but not yet wiped out.
const WINDOW_FADE_DB: f32 = 30.0;
/// Minimum dB span between weighted min and weighted max used for output
/// normalization. Without this, near-silence collapses the range to zero
/// and any tiny transient saturates the bar.
// const MIN_RANGE_DB: f32 = 6.0;
/// EMA alpha for output smoothing — filters frame-to-frame jitter while
/// staying responsive.
const EMA_ALPHA: f32 = 0.2;
/// Falloff rate per frame for graceful decay after a transient ends.
const FALLOFF_PER_FRAME: f32 = 0.05;

/// Ring buffer of dB samples. Computes a weighted dynamic range where each
/// sample's effective value is biased toward the centre with its age, so
/// older samples contribute less to the extremes and fade out by the window
/// edge.
struct BandHistory {
    samples: Vec<f32>,
    head: usize,
    /// Multiplier on `ln(1 + age)` to produce the per-sample bias. Sized so
    /// that `bias(age = window_frames - 1) == WINDOW_FADE_DB`.
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

    /// Effective max = `sample - log_bias_scale * ln(1 + age)` (newest keeps
    /// full value, older peaks fade with diminishing returns); effective min
    /// mirrors with `+ bias`. Returned as a tuple because callers always
    /// need both, and a single pass over the ring is cheaper than two.
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
        // let range = (max - min).max(MIN_RANGE_DB);
        ((current - min) / (max - min)).clamp(0.0, 1.0)
    }
}

/// Peak-meter smoothing: snap instantly to anything above the previous
/// frame so brief transients (kick drums, snares) reach full height, then
/// decay slowly. Decay is the larger of an EMA blend and a linear floor —
/// the floor keeps small values from collapsing to zero too quickly.
fn smooth(raw: f32, prev: f32) -> f32 {
    if raw > prev {
        raw
    } else {
        let ema = EMA_ALPHA * raw + (1.0 - EMA_ALPHA) * prev;
        ema.max(prev - FALLOFF_PER_FRAME)
    }
}

/// Accumulates audio samples and produces frequency band analysis via FFT.
///
/// Output values represent **where in the recent dynamic range** each band
/// currently sits. Per band we keep a 5-second sliding window of dB values;
/// the floor and ceiling are a weighted min/max where older samples are
/// biased toward the centre by `ln(1 + age)`, so the discount ramps in
/// quickly and then plateaus. Output = (current - floor) / (ceiling - floor),
/// clamped to [0, 1].
///
/// Pipeline:
///   1. Peak bin magnitude per band from the FFT (peak, not mean: the FFT
///      has linear frequency resolution while music energy follows a pink
///      spectrum, so mean-per-bin would suppress higher bands).
///   2. Convert to dB.
///   3. Push current dB into each band's sliding window.
///   4. Compute weighted min (floor) and weighted max (ceiling).
///   5. Output = `(current - floor) / max(ceiling - floor, MIN_RANGE_DB)`,
///      clamped to `[0, 1]`.
///   6. EMA + falloff smoothing for visual continuity.
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
    /// Previous frame's output values for falloff smoothing.
    prev_bands: [f32; NUM_BANDS],
    prev_all: f32,
}

impl FftAnalyzer {
    pub fn new(fft_size: usize, sample_rate: u32) -> Self {
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(fft_size);
        let scratch_len = fft.get_inplace_scratch_len();

        // Hann window
        let window: Vec<f32> = (0..fft_size)
            .map(|i| {
                #[allow(clippy::cast_precision_loss)]
                let x = 2.0 * PI * i as f32 / (fft_size - 1) as f32;
                0.5 * (1.0 - x.cos())
            })
            .collect();

        // Logarithmic band edges from 40 Hz to 20 kHz: edge[i] = 40 * 500^(i/16).
        let mut band_edges = [0.0_f32; NUM_BANDS + 1];
        #[allow(clippy::cast_precision_loss)]
        for (i, edge) in band_edges.iter_mut().enumerate() {
            *edge = 40.0 * 500.0_f32.powf(i as f32 / NUM_BANDS as f32);
        }

        // One FFT frame per fft_size samples.
        #[allow(clippy::cast_precision_loss)]
        let frame_rate = sample_rate as f32 / fft_size as f32;
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let window_frames = (HISTORY_SECONDS * frame_rate).ceil() as usize;

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
        }
    }

    /// Feed a mono sample into the analyzer. Returns analysis when a full
    /// FFT frame is ready.
    #[allow(clippy::cast_precision_loss, clippy::cast_possible_truncation)]
    pub fn push_sample(&mut self, sample: f32) -> Option<AudioAnalysis> {
        self.buffer[self.buffer_pos] = sample;
        self.buffer_pos += 1;

        if self.buffer_pos < self.fft_size {
            return None;
        }
        self.buffer_pos = 0;

        for (out, (&s, &w)) in self
            .fft_input
            .iter_mut()
            .zip(self.buffer.iter().zip(self.window.iter()))
        {
            *out = Complex::new(s * w, 0.0);
        }

        self.fft
            .process_with_scratch(&mut self.fft_input, &mut self.planner_scratch);

        // Only use first half (positive frequencies).
        let half = self.fft_size / 2;
        let bin_hz = self.sample_rate as f32 / self.fft_size as f32;
        let fft_size_f = self.fft_size as f32;

        let mut band_peaks = [0.0_f32; NUM_BANDS];
        let mut all_peak: f32 = 0.0;

        for (i, c) in self.fft_input.iter().enumerate().take(half) {
            let freq = i as f32 * bin_hz;
            let magnitude_sq = c.norm_sqr();

            if magnitude_sq > all_peak {
                all_peak = magnitude_sq;
            }

            // Binary search on edges for the band this bin belongs to.
            let band = self.band_edges.partition_point(|&edge| edge <= freq);
            if band > 0 && band <= NUM_BANDS && band_peaks[band - 1] < magnitude_sq {
                band_peaks[band - 1] = magnitude_sq;
            }
        }

        let to_db = |peak_mag_sq: f32| -> f32 {
            let amplitude = peak_mag_sq.sqrt() / fft_size_f;
            (20.0 * amplitude.log10()).max(ABS_DB_FLOOR)
        };

        let db_all = to_db(all_peak);
        let db_bands = band_peaks.map(to_db);

        let mut bands = [0.0_f32; NUM_BANDS];
        for i in 0..NUM_BANDS {
            self.band_histories[i].push(db_bands[i]);
            bands[i] = smooth(
                self.band_histories[i].normalize(db_bands[i]),
                self.prev_bands[i],
            );
        }
        self.all_history.push(db_all);
        let all = smooth(self.all_history.normalize(db_all), self.prev_all);

        self.prev_bands = bands;
        self.prev_all = all;

        Some(AudioAnalysis {
            bands,
            all,
            calculated_at_ms: 0,
        })
    }
}
