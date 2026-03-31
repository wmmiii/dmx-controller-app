//! Custom audio beat detection that replaces the `beat-detector` crate.
//!
//! The previous crate required signal amplitudes of at least 30% of `i16::MAX`
//! before considering a beat, which is far too high for microphone input
//! picking up music from speakers.  This module uses an adaptive
//! energy-based approach that works with any signal level.
//!
//! A second-order biquad low-pass filter (cutoff ≈ 150 Hz) isolates bass
//! energy (kick drums, bass lines) before the energy comparison, which
//! dramatically reduces false positives from vocals, cymbals, and other
//! high-frequency content.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{BufferSize, Device, SampleFormat, StreamConfig, StreamError};
use std::collections::BTreeMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::{self, JoinHandle};

/// Number of recent energy values to keep for the running average.
const ENERGY_HISTORY_LEN: usize = 43;

/// A beat is detected when the current window energy exceeds
/// `BEAT_THRESHOLD_FACTOR` × the running average energy.
const BEAT_THRESHOLD_FACTOR: f64 = 1.4;

/// Minimum milliseconds between two consecutive beat detections.
/// 250 ms ≈ 240 BPM ceiling which is generous for most music.
const MIN_BEAT_INTERVAL_MS: f64 = 250.0;

/// Minimum absolute energy to avoid triggering on silence/noise.
/// This is intentionally very low so that mic input still works.
const MIN_ABSOLUTE_ENERGY: f64 = 0.0002;

/// Low-pass filter cutoff frequency in Hz.  150 Hz captures kick drums and
/// bass lines while rejecting vocals, snares, cymbals, and ambient noise.
const LPF_CUTOFF_HZ: f64 = 150.0;

/// Audio buffer size in samples (per channel).
/// 1024 samples at 44.1 kHz ≈ 23 ms per window.
const BUFFER_SIZE: u32 = 1024;

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
        "Audio beat detection: device={:?}, rate={sample_rate}, format={sample_format:?}, channels={channels}",
        device.name().unwrap_or_else(|_| "unknown".into()),
    );

    let stream_config = StreamConfig {
        channels,
        sample_rate: config.sample_rate(),
        buffer_size: BufferSize::Fixed(BUFFER_SIZE),
    };

    let handle = thread::spawn(move || {
        let detector = BeatDetector::new(sample_rate, channels);

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

        // Park the thread until cancellation, yielding CPU.
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

// ---------------------------------------------------------------------------
// Biquad low-pass filter
// ---------------------------------------------------------------------------

/// Second-order IIR (biquad) low-pass filter.
///
/// Designed using the cookbook formulae from Robert Bristow-Johnson's Audio EQ
/// Cookbook.  The filter state is stored internally so it persists across
/// successive audio buffers.
struct BiquadLpf {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
    // Filter delay state (Direct Form I).
    x1: f64,
    x2: f64,
    y1: f64,
    y2: f64,
}

impl BiquadLpf {
    /// Creates a new low-pass biquad for the given `sample_rate` and
    /// `cutoff_hz`.  Uses a Q of 0.707 (Butterworth) for a maximally-flat
    /// passband.
    fn new(sample_rate: u32, cutoff_hz: f64) -> Self {
        let omega = 2.0 * std::f64::consts::PI * cutoff_hz / f64::from(sample_rate);
        let sin_omega = omega.sin();
        let cos_omega = omega.cos();
        let alpha = sin_omega / (2.0 * std::f64::consts::FRAC_1_SQRT_2); // Q = 1/sqrt(2)

        let b0 = (1.0 - cos_omega) / 2.0;
        let b1 = 1.0 - cos_omega;
        let b2 = (1.0 - cos_omega) / 2.0;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_omega;
        let a2 = 1.0 - alpha;

        // Normalise by a0.
        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    /// Filters `samples` in-place, updating internal state.
    fn process(&mut self, samples: &mut [f64]) {
        for s in samples.iter_mut() {
            let x0 = *s;
            let y0 = self.b0 * x0 + self.b1 * self.x1 + self.b2 * self.x2
                - self.a1 * self.y1
                - self.a2 * self.y2;
            self.x2 = self.x1;
            self.x1 = x0;
            self.y2 = self.y1;
            self.y1 = y0;
            *s = y0;
        }
    }
}

// ---------------------------------------------------------------------------
// Energy-based beat detector
// ---------------------------------------------------------------------------

/// An adaptive, energy-based beat detector.
///
/// For each audio buffer it applies a low-pass filter to isolate bass
/// frequencies, computes the RMS energy, compares it to a running average of
/// recent energies, and fires a beat when the current energy is significantly
/// above average.  A cooldown timer prevents double-triggers.
struct BeatDetector {
    state: std::sync::Mutex<DetectorState>,
    ms_per_sample: f64,
    channels: u16,
}

struct DetectorState {
    lpf: BiquadLpf,
    energy_history: Vec<f64>,
    history_cursor: usize,
    history_full: bool,
    /// Timestamp (in ms since stream start) of the last detected beat.
    last_beat_ms: f64,
    /// Running time in ms.
    time_ms: f64,
}

impl BeatDetector {
    fn new(sample_rate: u32, channels: u16) -> Self {
        Self {
            state: std::sync::Mutex::new(DetectorState {
                lpf: BiquadLpf::new(sample_rate, LPF_CUTOFF_HZ),
                energy_history: vec![0.0; ENERGY_HISTORY_LEN],
                history_cursor: 0,
                history_full: false,
                last_beat_ms: f64::NEG_INFINITY,
                time_ms: 0.0,
            }),
            ms_per_sample: 1000.0 / f64::from(sample_rate),
            channels,
        }
    }

    /// Process a buffer of f32 samples (already in [-1.0, 1.0]).
    fn process_f32(&self, data: &[f32]) -> bool {
        let mono = Self::to_mono_f64_from_f32(data, self.channels);
        self.detect(&mono)
    }

    /// Process a buffer of i16 samples.
    fn process_i16(&self, data: &[i16]) -> bool {
        let mono = Self::to_mono_f64_from_i16(data, self.channels);
        self.detect(&mono)
    }

    /// Process a buffer of u16 samples.
    fn process_u16(&self, data: &[u16]) -> bool {
        let mono = Self::to_mono_f64_from_u16(data, self.channels);
        self.detect(&mono)
    }

    #[allow(clippy::cast_precision_loss)]
    fn detect(&self, mono_samples: &[f64]) -> bool {
        if mono_samples.is_empty() {
            return false;
        }

        let Ok(mut state) = self.state.lock() else {
            return false;
        };

        // Apply low-pass filter to isolate bass frequencies.
        let mut filtered = mono_samples.to_vec();
        state.lpf.process(&mut filtered);

        // RMS energy of the bass-filtered window.
        let energy: f64 =
            filtered.iter().map(|s| s * s).sum::<f64>() / filtered.len() as f64;

        let window_ms = mono_samples.len() as f64 * self.ms_per_sample;
        state.time_ms += window_ms;

        // Compute running average from history.
        let history_count = if state.history_full {
            ENERGY_HISTORY_LEN
        } else {
            state.history_cursor
        };

        let avg_energy = if history_count > 0 {
            state.energy_history[..if state.history_full {
                ENERGY_HISTORY_LEN
            } else {
                state.history_cursor
            }]
                .iter()
                .sum::<f64>()
                / history_count as f64
        } else {
            0.0
        };

        // Push current energy into circular buffer.
        let cursor = state.history_cursor;
        state.energy_history[cursor] = energy;
        state.history_cursor += 1;
        if state.history_cursor >= ENERGY_HISTORY_LEN {
            state.history_cursor = 0;
            state.history_full = true;
        }

        // Need enough history before detecting.
        if history_count < 4 {
            return false;
        }

        // Check beat conditions.
        let since_last = state.time_ms - state.last_beat_ms;
        if since_last < MIN_BEAT_INTERVAL_MS {
            return false;
        }

        if energy < MIN_ABSOLUTE_ENERGY {
            return false;
        }

        if energy > avg_energy * BEAT_THRESHOLD_FACTOR {
            state.last_beat_ms = state.time_ms;
            true
        } else {
            false
        }
    }

    // -- Conversion helpers --------------------------------------------------

    #[allow(clippy::cast_precision_loss)]
    fn to_mono_f64_from_f32(data: &[f32], channels: u16) -> Vec<f64> {
        let ch = channels as usize;
        data.chunks(ch)
            .map(|frame| {
                let sum: f64 = frame.iter().map(|&s| f64::from(s)).sum();
                sum / ch as f64
            })
            .collect()
    }

    #[allow(clippy::cast_precision_loss)]
    fn to_mono_f64_from_i16(data: &[i16], channels: u16) -> Vec<f64> {
        let ch = channels as usize;
        let scale = 1.0 / f64::from(i16::MAX);
        data.chunks(ch)
            .map(|frame| {
                let sum: f64 = frame.iter().map(|&s| f64::from(s) * scale).sum();
                sum / ch as f64
            })
            .collect()
    }

    #[allow(clippy::cast_precision_loss)]
    fn to_mono_f64_from_u16(data: &[u16], channels: u16) -> Vec<f64> {
        let ch = channels as usize;
        let scale = 1.0 / f64::from(i16::MAX);
        let offset = f64::from(u16::MAX) / 2.0;
        data.chunks(ch)
            .map(|frame| {
                let sum: f64 = frame.iter().map(|&s| (f64::from(s) - offset) * scale).sum();
                sum / ch as f64
            })
            .collect()
    }
}
