use crate::proto::{WaveformData, WaveformLevel, WaveformPoint};
use biquad::{Biquad, Coefficients, DirectForm2Transposed, Q_BUTTERWORTH_F32, ToHertz, Type};
use std::collections::HashMap;

/// Frequency cutoff between low and mid bands (Hz).
const LOW_CUTOFF: f32 = 200.0;
/// Frequency cutoff between mid and high bands (Hz).
const HIGH_CUTOFF: f32 = 2500.0;

/// Per-band exponent for perceptual compression.
const LOW_EXPONENT: f32 = 0.35;
const MID_EXPONENT: f32 = 0.55;
const HIGH_EXPONENT: f32 = 0.7;

const BASE_SAMPLES_PER_POINT: u32 = 64;
const LOD_LEVELS: [u32; 5] = [64, 256, 1024, 4096, 16384];

#[allow(clippy::cast_precision_loss)]
#[must_use]
pub fn analyze_waveform(samples: &[f32], sample_rate_hz: u32) -> WaveformData {
    let total_samples = samples.len() as u64;
    let duration_ms = if sample_rate_hz > 0 {
        (total_samples * 1000) / u64::from(sample_rate_hz)
    } else {
        0
    };

    let base_level = analyze_with_filters(samples, sample_rate_hz);

    let mut levels = HashMap::new();
    for &samples_per_point in &LOD_LEVELS {
        let level = if samples_per_point == BASE_SAMPLES_PER_POINT {
            base_level.clone()
        } else {
            downsample_level(&base_level, samples_per_point)
        };
        levels.insert(samples_per_point, level);
    }

    WaveformData {
        sample_rate: sample_rate_hz,
        total_samples,
        duration_ms,
        levels,
    }
}

#[allow(clippy::cast_precision_loss)]
fn analyze_with_filters(samples: &[f32], sample_rate: u32) -> WaveformLevel {
    let chunk_size = BASE_SAMPLES_PER_POINT as usize;
    let num_points = samples.len().div_ceil(chunk_size);

    let fs = (sample_rate as f32).hz();

    // Create biquad filters for 3 bands
    let mut low_filter = DirectForm2Transposed::<f32>::new(
        Coefficients::<f32>::from_params(Type::LowPass, fs, LOW_CUTOFF.hz(), Q_BUTTERWORTH_F32)
            .unwrap(),
    );
    let mut mid_filter_high_pass = DirectForm2Transposed::<f32>::new(
        Coefficients::<f32>::from_params(Type::HighPass, fs, LOW_CUTOFF.hz(), Q_BUTTERWORTH_F32)
            .unwrap(),
    );
    let mut mid_filter_low_pass = DirectForm2Transposed::<f32>::new(
        Coefficients::<f32>::from_params(Type::LowPass, fs, HIGH_CUTOFF.hz(), Q_BUTTERWORTH_F32)
            .unwrap(),
    );
    let mut high_filter = DirectForm2Transposed::<f32>::new(
        Coefficients::<f32>::from_params(Type::HighPass, fs, HIGH_CUTOFF.hz(), Q_BUTTERWORTH_F32)
            .unwrap(),
    );

    let mut points = Vec::with_capacity(num_points);

    for chunk in samples.chunks(chunk_size) {
        let mut low_sum_sq = 0.0f32;
        let mut mid_sum_sq = 0.0f32;
        let mut high_sum_sq = 0.0f32;

        for &sample in chunk {
            // Low band: lowpass at LOW_CUTOFF
            let low = low_filter.run(sample);
            low_sum_sq += low * low;

            // Mid band: highpass at LOW_CUTOFF, then lowpass at HIGH_CUTOFF
            let mid = mid_filter_low_pass.run(mid_filter_high_pass.run(sample));
            mid_sum_sq += mid * mid;

            // High band: highpass at HIGH_CUTOFF
            let high = high_filter.run(sample);
            high_sum_sq += high * high;
        }

        let n = chunk.len() as f32;
        let low_rms = (low_sum_sq / n).sqrt();
        let mid_rms = (mid_sum_sq / n).sqrt();
        let high_rms = (high_sum_sq / n).sqrt();

        points.push(WaveformPoint {
            low: normalize_rms(low_rms, LOW_EXPONENT),
            mid: normalize_rms(mid_rms, MID_EXPONENT),
            high: normalize_rms(high_rms, HIGH_EXPONENT),
        });
    }

    WaveformLevel {
        samples_per_point: BASE_SAMPLES_PER_POINT,
        points,
    }
}

/// Normalize RMS to 0-1 range using -40 dB as the floor, with per-band compression.
fn normalize_rms(rms: f32, exponent: f32) -> f32 {
    if rms <= 0.0 {
        return 0.0;
    }
    let db = 20.0 * rms.log10();
    let normalized = ((db + 40.0) / 40.0).clamp(0.0, 1.0);
    // Apply exponent for perceptual compression.
    normalized.powf(exponent)
}

#[allow(clippy::cast_precision_loss)]
fn downsample_level(base: &WaveformLevel, target_samples_per_point: u32) -> WaveformLevel {
    let ratio = (target_samples_per_point / base.samples_per_point) as usize;
    if ratio <= 1 {
        return base.clone();
    }

    let num_points = base.points.len().div_ceil(ratio);
    let mut points = Vec::with_capacity(num_points);

    for chunk in base.points.chunks(ratio) {
        let mut low_sum = 0.0f32;
        let mut mid_sum = 0.0f32;
        let mut high_sum = 0.0f32;

        for p in chunk {
            low_sum += p.low;
            mid_sum += p.mid;
            high_sum += p.high;
        }

        let n = chunk.len() as f32;
        points.push(WaveformPoint {
            low: low_sum / n,
            mid: mid_sum / n,
            high: high_sum / n,
        });
    }

    WaveformLevel {
        samples_per_point: target_samples_per_point,
        points,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    #[test]
    fn test_analyze_silence() {
        let samples = vec![0.0f32; 44100]; // 1 second of silence
        let result = analyze_waveform(&samples, 44100);

        assert_eq!(result.sample_rate, 44100);
        assert_eq!(result.total_samples, 44100);
        assert_eq!(result.duration_ms, 1000);
        assert_eq!(result.levels.len(), 5);

        // All bands should be near zero for silence
        for level in result.levels.values() {
            for point in &level.points {
                assert!(point.low < 0.01, "Expected near-zero low band for silence");
                assert!(point.mid < 0.01, "Expected near-zero mid band for silence");
                assert!(
                    point.high < 0.01,
                    "Expected near-zero high band for silence"
                );
            }
        }
    }

    #[test]
    fn test_analyze_sine_wave() {
        // Generate a 440 Hz sine wave (mid band)
        let sample_rate = 44100;
        let duration_sec = 1.0;
        let frequency = 440.0;
        let num_samples = (sample_rate as f32 * duration_sec) as usize;

        let samples: Vec<f32> = (0..num_samples)
            .map(|i| {
                let t = i as f32 / sample_rate as f32;
                (2.0 * PI * frequency * t).sin() * 0.5 // 50% amplitude
            })
            .collect();

        let result = analyze_waveform(&samples, sample_rate);

        // 440 Hz should show up primarily in the mid band
        let level = result.levels.get(&1024).unwrap();
        assert!(!level.points.is_empty());

        // Check that mid band has significant energy
        let avg_mid: f32 =
            level.points.iter().map(|p| p.mid).sum::<f32>() / level.points.len() as f32;
        assert!(
            avg_mid > 0.1,
            "Expected significant mid band energy for 440 Hz tone"
        );
    }

    #[test]
    fn test_lod_levels_present() {
        let samples = vec![0.0f32; 44100];
        let result = analyze_waveform(&samples, 44100);

        // All expected LOD levels should be present
        assert!(result.levels.contains_key(&64));
        assert!(result.levels.contains_key(&256));
        assert!(result.levels.contains_key(&1024));
        assert!(result.levels.contains_key(&4096));
        assert!(result.levels.contains_key(&16384));
    }
}
