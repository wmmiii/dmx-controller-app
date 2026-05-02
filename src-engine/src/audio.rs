use serde::Serialize;
use std::sync::{LazyLock, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

/// Number of logarithmically-spaced frequency bands.
pub const NUM_BANDS: usize = 16;

/// Perceived loudness for each frequency band, normalized to 0.0–1.0.
#[derive(Serialize, Clone)]
pub struct AudioAnalysis {
    /// 16 logarithmically-spaced frequency bands from ~40 Hz to ~20 kHz.
    pub bands: [f32; NUM_BANDS],
    /// Overall peak loudness across all frequencies.
    pub all: f32,
    /// Full-spectrum onset detected this frame (spectral flux across all bands).
    pub beat: bool,
    /// Bass onset (~40–96 Hz, bands 0-2): kick drums, sub bass.
    pub beat_bass: bool,
    /// Mid onset (~220–1100 Hz, bands 4-9): snare, guitar, vocals.
    pub beat_mid: bool,
    /// Treble onset (~5–20 kHz, bands 12-15): hi-hats, cymbals.
    pub beat_treble: bool,
    /// Unix timestamp in milliseconds when this analysis was calculated.
    pub calculated_at_ms: u64,
}

impl Default for AudioAnalysis {
    fn default() -> Self {
        Self {
            bands: [0.0; NUM_BANDS],
            all: 0.0,
            beat: false,
            beat_bass: false,
            beat_mid: false,
            beat_treble: false,
            calculated_at_ms: 0,
        }
    }
}

/// Global audio analysis state — holds the most recent analysis result.
static AUDIO_STATE: LazyLock<Mutex<AudioAnalysis>> =
    LazyLock::new(|| Mutex::new(AudioAnalysis::default()));

/// Stores a new audio analysis snapshot, stamping it with the current time.
pub fn update_audio_analysis(mut analysis: AudioAnalysis) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    analysis.calculated_at_ms = u64::try_from(now.as_millis()).unwrap_or(0);

    let mut state = AUDIO_STATE.lock().expect("audio state lock poisoned");
    *state = analysis;
}

/// Returns a clone of the most recent audio analysis.
pub fn get_audio_analysis() -> AudioAnalysis {
    AUDIO_STATE
        .lock()
        .expect("audio state lock poisoned")
        .clone()
}
