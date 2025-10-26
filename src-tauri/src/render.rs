use dmx_engine::proto::Project;
use dmx_engine::render::scene::render_scene_dmx;
use prost::Message;

#[tauri::command]
pub fn render_dmx_scene(
    project_binary: Vec<u8>,
    output_id: String,
    system_t: u64,
    frame: u32,
) -> Result<Vec<u8>, String> {
    let project = Project::decode(&project_binary[..])
        .map_err(|e| format!("Failed to decode project: {}", e))?;

    let oid = output_id.parse::<u64>().unwrap();

    let universe = render_scene_dmx(&project, oid, system_t, frame)?;

    Ok(universe.to_vec())
}
