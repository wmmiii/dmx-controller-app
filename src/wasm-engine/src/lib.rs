use dmx_engine::project::PROJECT_REF;
use dmx_engine::render::render;
use prost::Message;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn hello_from_rust(name: &str) -> String {
    dmx_engine::hello_from_rust(name)
}

#[wasm_bindgen]
pub fn init_engine() {
    dmx_engine::init_engine();
}

#[wasm_bindgen]
pub fn process_project(project_bytes: &[u8]) -> Result<String, JsValue> {
    let project = dmx_engine::proto::Project::decode(project_bytes)
        .map_err(|e| JsValue::from_str(&format!("Failed to decode project: {}", e)))?;

    dmx_engine::process_project(&project).map_err(|e| JsValue::from_str(&e))
}

#[wasm_bindgen]
pub fn render_dmx(output_id: u64, system_t: u64, frame: u32) -> Result<Vec<u8>, JsValue> {
    let universe =
        render::render_dmx(output_id, system_t, frame).map_err(|e| JsValue::from_str(&e))?;

    Ok(universe.to_vec())
}

#[wasm_bindgen]
pub fn render_wled(output_id: u64, system_t: u64, frame: u32) -> Result<Vec<u8>, JsValue> {
    let wled_render_target =
        render::render_wled(output_id, system_t, frame).map_err(|e| JsValue::from_str(&e))?;

    Ok(wled_render_target.encode_to_vec())
}

#[wasm_bindgen]
pub fn update_project(project_bytes: &[u8]) -> Result<(), JsValue> {
    let project_object = dmx_engine::proto::Project::decode(project_bytes)
        .map_err(|e| JsValue::from_str(&format!("Failed to decode project: {}", e)))?;

    let mut project_mutex = PROJECT_REF
        .lock()
        .map_err(|e| format!("Failed to lock project: {}", e))?;

    *project_mutex = project_object;

    Ok(())
}

#[wasm_bindgen]
pub fn set_render_mode(render_mode_bytes: &[u8]) -> Result<(), JsValue> {
    let render_mode_object = dmx_engine::proto::RenderMode::decode(render_mode_bytes)
        .map_err(|e| JsValue::from_str(&format!("Failed to decode render mode: {}", e)))?;

    let mut render_mode_mutex = render::RENDER_MODE_REF
        .lock()
        .map_err(|e| format!("Failed to lock render mode: {}", e))?;

    *render_mode_mutex = render_mode_object;

    Ok(())
}
