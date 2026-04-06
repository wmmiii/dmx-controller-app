/// Re-export engine types so call-sites in this crate don't need to reach
/// into `dmx_engine` directly.
pub use dmx_engine::beat::BeatSampler;

use dmx_engine::beat::{
    beat_t, effective_beat_metadata, set_bpm as engine_set_bpm,
    set_first_beat as engine_set_first_beat, transition_beat,
};
use dmx_engine::project;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

pub(crate) type SharedBeatSampler = Arc<StdMutex<TauriBeatSampler>>;

/// Wraps the platform-independent [`BeatSampler`] with async coordination
/// state that depends on the Tokio runtime.
pub struct TauriBeatSampler {
    inner: BeatSampler,
    pub sampling: bool,
}

impl TauriBeatSampler {
    pub fn new() -> Self {
        Self {
            inner: BeatSampler::new(),
            sampling: false,
        }
    }

    pub fn add_sample(&mut self, app_handle: &AppHandle, t: u64) {
        let new_beat_optional = self.inner.add_sample(t);
        self.sampling = true;

        if let Some(new_beat) = new_beat_optional {
            let _ = project::with_project_mut(|project| transition_beat(project, &new_beat, t));
        }

        let _ = app_handle.emit("beat-sampling-state", true);
    }
}

/// Add a beat sample for tempo detection (called from keyboard shortcut)
#[tauri::command]
#[allow(clippy::cast_possible_truncation)]
pub async fn add_beat_sample(
    app_handle: AppHandle,
    beat_sampler: State<'_, SharedBeatSampler>,
) -> Result<(), String> {
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;

    let beat_sampler = Arc::clone(&beat_sampler);
    let mut sampler = beat_sampler
        .lock()
        .map_err(|e| format!("Failed to lock beat sampler: {e}"))?;
    sampler.add_sample(&app_handle, t);

    Ok(())
}

/// Returns the current beat position `[0.0, 1.0)` using the engine clock.
#[tauri::command]
#[allow(clippy::cast_possible_truncation, clippy::unnecessary_wraps)]
pub fn get_beat_t() -> Result<f64, String> {
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;

    project::with_project(|project| {
        let beat = effective_beat_metadata(project, t).ok_or("Beat not set!")?;
        beat_t(&beat, t)
    })
}

/// Returns the current beat position `[0.0, 1.0)` using the engine clock.
#[tauri::command]
pub fn set_first_beat() -> Result<(), String> {
    project::with_project_mut(engine_set_first_beat)
}

/// Returns the current beat position `[0.0, 1.0)` using the engine clock.
#[tauri::command]
pub fn set_bpm(bpm: u16) -> Result<(), String> {
    project::with_project_mut(|project| engine_set_bpm(project, bpm))
}
