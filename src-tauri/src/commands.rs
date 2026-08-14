use crate::event_sink;
use dmx_engine::beat::{set_bpm as engine_set_bpm, set_first_beat as engine_set_first_beat};
use dmx_engine::project;
use dmx_runtime::runtime::Runtime;
use dmx_runtime::util::now_ms;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, State};

#[cfg(desktop)]
use dmx_runtime::audio_input::AudioInputDevice;
#[cfg(desktop)]
use dmx_runtime::midi::MidiPortCandidate;

#[cfg(desktop)]
#[tauri::command]
pub fn list_ports() -> Result<Vec<String>, String> {
    dmx_runtime::serial::list_ports()
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn compile_visualizer(
    runtime: State<'_, Arc<Runtime>>,
    id: String,
    glsl_source: String,
) -> Result<Vec<u8>, String> {
    let shader_state = runtime
        .shader
        .as_ref()
        .ok_or("Shader engine not initialized")?;
    dmx_runtime::shader::compile_visualizer(shader_state, &id, &glsl_source)
}

#[tauri::command]
pub fn get_builtin_visualizers() -> HashMap<String, Vec<u8>> {
    dmx_runtime::shader::get_builtin_visualizers()
}

/// Add a beat sample for tempo detection (called from keyboard shortcut).
#[tauri::command]
pub async fn add_beat_sample(runtime: State<'_, Arc<Runtime>>) -> Result<(), String> {
    let mut sampler = runtime
        .beat_sampler
        .lock()
        .map_err(|e| format!("Failed to lock beat sampler: {e}"))?;

    if !sampler.accepts_taps() {
        return Ok(());
    }

    dmx_runtime::beat::add_sample(&mut sampler, runtime.events.as_ref(), now_ms());

    Ok(())
}

/// Sets the current moment as "beat 1" to align the beat offset.
#[tauri::command]
pub fn set_first_beat() -> Result<(), String> {
    project::with_project_mut(engine_set_first_beat)
}

#[tauri::command]
pub fn set_bpm(bpm: u16) -> Result<(), String> {
    project::with_project_mut(|project| engine_set_bpm(project, bpm))
}

#[tauri::command]
pub async fn frontend_ready_for_update(app: AppHandle) -> Result<(), String> {
    event_sink::frontend_ready(&app);
    Ok(())
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
    runtime: State<'_, Arc<Runtime>>,
    candidate: MidiPortCandidate,
) -> Result<(), String> {
    let midi = runtime.midi.as_ref().ok_or("MIDI is not enabled")?;
    dmx_runtime::midi::connect_midi(midi, candidate)
}

#[cfg(desktop)]
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub async fn disconnect_midi(
    runtime: State<'_, Arc<Runtime>>,
    device_name: String,
) -> Result<(), String> {
    let midi = runtime.midi.as_ref().ok_or("MIDI is not enabled")?;
    dmx_runtime::midi::disconnect_midi(midi, &device_name);
    Ok(())
}
