use dmx_engine::{project::PROJECT_REF, proto::Project};
use prost::Message;
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex as TokioMutex;

use crate::output_loop::OutputLoopManager;
use crate::sacn::SacnState;
use crate::serial::SerialState;
use crate::wled::WledState;

/// Event emitted when the project is updated from the Rust backend
#[derive(Clone, Serialize)]
struct ProjectUpdateEvent {
    /// Binary protobuf data of the updated project (without assets)
    project_binary: Vec<u8>,
    /// Description of what changed
    description: String,
}

#[tauri::command]
pub async fn update_project(
    project_binary: Vec<u8>,
    output_loop_manager: State<'_, Arc<TokioMutex<OutputLoopManager>>>,
    serial_state: State<'_, Arc<TokioMutex<SerialState>>>,
    sacn_state: State<'_, Arc<TokioMutex<SacnState>>>,
    wled_state: State<'_, Arc<TokioMutex<WledState>>>,
) -> Result<(), String> {
    let project_object = Project::decode(&project_binary[..])
        .map_err(|e| format!("Failed to decode project: {}", e))?;

    // Use a scoped block to ensure the mutex guard is dropped before any .await
    {
        let mut project_mutex = PROJECT_REF
            .lock()
            .map_err(|e| format!("Failed to lock project: {}", e))?;

        *project_mutex = project_object;
    } // Mutex guard is dropped here

    // Automatically rebuild output loops when project changes
    let manager = output_loop_manager.lock().await;
    manager
        .rebuild_all_loops(
            serial_state.inner().clone(),
            sacn_state.inner().clone(),
            wled_state.inner().clone(),
        )
        .await?;

    Ok(())
}

/// Update the project from Rust and emit an event to the frontend
///
/// This function should be called when the Rust backend (e.g., MCP server) needs to
/// modify the project and notify the frontend of the change.
pub async fn update_project_from_rust(
    app: &AppHandle,
    updater: impl FnOnce(&mut Project),
    description: String,
    output_loop_manager: &Arc<TokioMutex<OutputLoopManager>>,
    serial_state: &Arc<TokioMutex<SerialState>>,
    sacn_state: &Arc<TokioMutex<SacnState>>,
    wled_state: &Arc<TokioMutex<WledState>>,
) -> Result<(), String> {
    // Update the project
    let project_binary = {
        let mut project_mutex = PROJECT_REF
            .lock()
            .map_err(|e| format!("Failed to lock project: {}", e))?;

        // Apply the update
        updater(&mut project_mutex);

        // Clone project without assets for event emission
        let mut project_for_event = project_mutex.clone();
        project_for_event.assets = None;

        // Serialize to binary
        project_for_event.encode_to_vec()
    }; // Mutex guard is dropped here

    // Rebuild output loops
    let manager = output_loop_manager.lock().await;
    manager
        .rebuild_all_loops(
            serial_state.clone(),
            sacn_state.clone(),
            wled_state.clone(),
        )
        .await?;
    drop(manager);

    // Emit event to frontend
    let event = ProjectUpdateEvent {
        project_binary,
        description: description.clone(),
    };

    if let Err(e) = app.emit("project-update", event) {
        log::error!("Failed to emit project-update event: {}", e);
        return Err(format!("Failed to emit project-update event: {}", e));
    }

    log::info!("Project updated from Rust: {}", description);

    Ok(())
}
