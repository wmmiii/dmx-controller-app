use dmx_engine::render::scene;
use prost::Message;

#[tauri::command]
pub fn render_scene_dmx(output_id: String, system_t: u64, frame: u32) -> Result<Vec<u8>, String> {
    let oid = output_id.parse::<u64>().unwrap();

    let universe = scene::render_scene_dmx(oid, system_t, frame)?;

    Ok(universe.to_vec())
}

#[tauri::command]
pub fn render_scene_wled(output_id: String, system_t: u64, frame: u32) -> Result<Vec<u8>, String> {
    let oid = output_id.parse::<u64>().unwrap();

    let wled_render_target = scene::render_scene_wled(oid, system_t, frame)?;

    Ok(wled_render_target.encode_to_vec())
}
