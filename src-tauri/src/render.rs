use dmx_engine::proto::Project;
use dmx_engine::render::scene;
use prost::Message;

#[tauri::command]
pub fn render_scene_dmx(
    project_binary: Vec<u8>,
    output_id: String,
    system_t: u64,
    frame: u32,
) -> Result<Vec<u8>, String> {
    let project = Project::decode(&project_binary[..])
        .map_err(|e| format!("Failed to decode project: {}", e))?;

    let oid = output_id.parse::<u64>().unwrap();

    let universe = scene::render_scene_dmx(&project, oid, system_t, frame)?;

    Ok(universe.to_vec())
}

#[tauri::command]
pub fn render_scene_wled(
    project_binary: Vec<u8>,
    output_id: String,
    system_t: u64,
    frame: u32,
) -> Result<Vec<u8>, String> {
    let project = Project::decode(&project_binary[..])
        .map_err(|e| format!("Failed to decode project: {}", e))?;

    let oid = output_id.parse::<u64>().unwrap();

    let wled_render_target = scene::render_scene_wled(&project, oid, system_t, frame)?;

    Ok(wled_render_target.encode_to_vec())
}
