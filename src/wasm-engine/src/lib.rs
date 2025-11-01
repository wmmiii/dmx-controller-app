use dmx_engine::render::scene;
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
pub fn render_scene_dmx(
    project_bytes: &[u8],
    output_id: u64,
    system_t: u64,
    frame: u32,
) -> Result<Vec<u8>, JsValue> {
    let project = dmx_engine::proto::Project::decode(project_bytes)
        .map_err(|e| JsValue::from_str(&format!("Failed to decode project: {}", e)))?;

    let universe = scene::render_scene_dmx(&project, output_id, system_t, frame)
        .map_err(|e| JsValue::from_str(&e))?;
    Ok(universe.to_vec())
}

#[wasm_bindgen]
pub fn render_scene_wled(
    project_bytes: &[u8],
    output_id: u64,
    system_t: u64,
    frame: u32,
) -> Result<Vec<u8>, JsValue> {
    let project = dmx_engine::proto::Project::decode(project_bytes)
        .map_err(|e| JsValue::from_str(&format!("Failed to decode project: {}", e)))?;

    let wled_render_target = scene::render_scene_wled(&project, output_id, system_t, frame)
        .map_err(|e| JsValue::from_str(&e))?;

    Ok(wled_render_target.encode_to_vec())
}
