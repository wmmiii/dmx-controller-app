use dmx_runtime::shader::ShaderState;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::State;

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
