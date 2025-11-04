use dmx_engine::{project::PROJECT_REF, proto::Project};
use prost::Message;

#[tauri::command]
pub fn update_project(project_binary: Vec<u8>) -> Result<(), String> {
    let project_object = Project::decode(&project_binary[..])
        .map_err(|e| format!("Failed to decode project: {}", e))?;

    let mut project_mutex = PROJECT_REF
        .lock()
        .map_err(|e| format!("Failed to lock project: {}", e))?;

    *project_mutex = project_object;

    Ok(())
}
