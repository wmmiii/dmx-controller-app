use dmx_engine::render;
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
pub fn render_live_dmx(project_bytes: &[u8], output_id: u64) -> Result<Vec<u8>, JsValue> {
    let project = dmx_engine::proto::Project::decode(project_bytes)
        .map_err(|e| JsValue::from_str(&format!("Failed to decode project: {}", e)))?;

    let universe = render::render_live_dmx(&project, output_id)
        .map_err(|e| JsValue::from_str(&e))?;
    Ok(universe.to_vec())
}
