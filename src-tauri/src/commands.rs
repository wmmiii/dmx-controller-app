use crate::event_sink::TauriEventSink;
use dmx_engine::beat::{set_bpm as engine_set_bpm, set_first_beat as engine_set_first_beat};
use dmx_engine::project;
use dmx_runtime::beat::SharedBeatSampler;
use dmx_runtime::shader::ShaderState;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, State};

#[cfg(desktop)]
use dmx_runtime::audio_input::AudioInputDevice;
#[cfg(desktop)]
use dmx_runtime::midi::{MidiPortCandidate, MidiState};
#[cfg(desktop)]
use tokio::sync::Mutex as TokioMutex;

#[cfg(desktop)]
#[tauri::command]
pub fn list_ports() -> Result<Vec<String>, String> {
    dmx_runtime::serial::list_ports()
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn compile_visualizer(
    shader_state: State<'_, Arc<Mutex<ShaderState>>>,
    id: String,
    glsl_source: String,
) -> Result<Vec<u8>, String> {
    dmx_runtime::shader::compile_visualizer(&shader_state, &id, &glsl_source)
}

#[tauri::command]
pub fn get_builtin_visualizers() -> HashMap<String, Vec<u8>> {
    dmx_runtime::shader::get_builtin_visualizers()
}

/// Add a beat sample for tempo detection (called from keyboard shortcut).
///
/// No-ops silently when audio beat detection is active (`audio_active = true`)
/// so that manual taps and microphone-derived beats don't interfere with each
/// other's BPM estimates.
#[tauri::command]
#[allow(clippy::cast_possible_truncation)]
pub async fn add_beat_sample(
    app_handle: AppHandle,
    beat_sampler: State<'_, SharedBeatSampler>,
) -> Result<(), String> {
    let beat_sampler = Arc::clone(&beat_sampler);
    let mut sampler = beat_sampler
        .lock()
        .map_err(|e| format!("Failed to lock beat sampler: {e}"))?;

    if sampler.audio_active {
        return Ok(());
    }

    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;
    sampler.add_sample(&TauriEventSink::new(app_handle), t);

    Ok(())
}

/// Sets the current moment as "beat 1" to align the beat offset.
#[tauri::command]
pub fn set_first_beat() -> Result<(), String> {
    project::with_project_mut(engine_set_first_beat)
}

/// Returns the current beat position `[0.0, 1.0)` using the engine clock.
#[tauri::command]
pub fn set_bpm(bpm: u16) -> Result<(), String> {
    project::with_project_mut(|project| engine_set_bpm(project, bpm))
}

#[cfg(desktop)]
#[tauri::command]
pub fn list_audio_inputs() -> Result<Vec<AudioInputDevice>, String> {
    dmx_runtime::audio_input::list_audio_inputs()
}

#[cfg(desktop)]
#[tauri::command]
pub fn list_midi_inputs() -> Result<Vec<MidiPortCandidate>, String> {
    dmx_runtime::midi::list_midi_inputs()
}

#[cfg(desktop)]
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub async fn connect_midi(
    state: State<'_, Arc<TokioMutex<MidiState>>>,
    candidate: MidiPortCandidate,
) -> Result<(), String> {
    dmx_runtime::midi::connect_midi(&state, candidate).await
}

#[cfg(desktop)]
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub async fn disconnect_midi(
    state: State<'_, Arc<TokioMutex<MidiState>>>,
    device_name: String,
) -> Result<(), String> {
    dmx_runtime::midi::disconnect_midi(&state, &device_name).await;
    Ok(())
}
