use dmx_engine::{project::PROJECT_REF, proto::Project};
use prost::Message;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex as TokioMutex;

use crate::output_loop::OutputLoopManager;
use crate::sacn::SacnState;
use crate::serial::SerialState;
use crate::wled::WledState;

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

    // Auto-bind serial outputs to their last known ports if available
    let serial = serial_state.lock().await;
    serial.auto_bind_serial_outputs()?;
    drop(serial);

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
