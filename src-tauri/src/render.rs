use dmx_engine::{
    proto::RenderMode,
    render::render::{self, RENDER_MODE_REF},
};
use prost::Message;

#[tauri::command]
pub fn render_dmx(output_id: String, system_t: u64, frame: u32) -> Result<Vec<u8>, String> {
    let oid = output_id.parse::<u64>().unwrap();

    let universe = render::render_dmx(oid, system_t, frame)?;

    Ok(universe.to_vec())
}

#[tauri::command]
pub fn render_wled(output_id: String, system_t: u64, frame: u32) -> Result<Vec<u8>, String> {
    let oid = output_id.parse::<u64>().unwrap();

    let wled_render_target = render::render_wled(oid, system_t, frame)?;

    Ok(wled_render_target.encode_to_vec())
}

#[tauri::command]
pub async fn set_render_mode(render_mode_binary: Vec<u8>) -> Result<(), String> {
    let render_mode_object = RenderMode::decode(&render_mode_binary[..])
        .map_err(|e| format!("Failed to decode render mode: {}", e))?;

    // Use a scoped block to ensure the mutex guard is dropped before any .await
    {
        let mut render_mode_mutux = RENDER_MODE_REF
            .lock()
            .map_err(|e| format!("Failed to lock render mode: {}", e))?;

        *render_mode_mutux = render_mode_object;
    } // Mutex guard is dropped here

    Ok(())
}
