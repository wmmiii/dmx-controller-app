use dmx_engine::project::{self, UndoState};
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex as TokioMutex;

use crate::output_loop::OutputLoopManager;
use crate::sacn::SacnState;
use crate::serial::SerialState;
use crate::wled::WledState;

const PROJECT_KEY: &str = "tmp-project-1";

/// Payload for the project-updated event
#[derive(Clone, Serialize)]
struct ProjectUpdatedPayload {
    project_binary: Vec<u8>,
    description: String,
}

/// Payload for the undo-state-changed event
#[derive(Clone, Serialize)]
pub struct UndoStatePayload {
    can_undo: bool,
    can_redo: bool,
    undo_description: Option<String>,
    redo_description: Option<String>,
}

impl From<UndoState> for UndoStatePayload {
    fn from(state: UndoState) -> Self {
        UndoStatePayload {
            can_undo: state.can_undo,
            can_redo: state.can_redo,
            undo_description: state.undo_description,
            redo_description: state.redo_description,
        }
    }
}

/// Persists project to AppData directory
async fn persist_to_disk(app: &AppHandle, project_binary: &[u8]) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    // Ensure directory exists
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    let file_path = app_data_dir.join(PROJECT_KEY);
    std::fs::write(&file_path, project_binary)
        .map_err(|e| format!("Failed to write project file: {}", e))?;

    Ok(())
}

/// Emits project-updated and undo-state-changed events to the frontend
fn emit_project_events(
    app: &AppHandle,
    project_binary: &[u8],
    description: &str,
) -> Result<(), String> {
    // Emit project-updated event
    app.emit(
        "project-updated",
        ProjectUpdatedPayload {
            project_binary: project_binary.to_vec(),
            description: description.to_string(),
        },
    )
    .map_err(|e| format!("Failed to emit project-updated: {}", e))?;

    // Emit undo-state-changed event
    let undo_state = project::get_undo_state()?;
    app.emit("undo-state-changed", UndoStatePayload::from(undo_state))
        .map_err(|e| format!("Failed to emit undo-state-changed: {}", e))?;

    Ok(())
}

/// Rebuilds output loops after project changes
async fn rebuild_outputs(
    serial_state: &Arc<TokioMutex<SerialState>>,
    output_loop_manager: &Arc<TokioMutex<OutputLoopManager>>,
    sacn_state: &Arc<TokioMutex<SacnState>>,
    wled_state: &Arc<TokioMutex<WledState>>,
) -> Result<(), String> {
    // Auto-bind serial outputs to their last known ports if available
    let serial = serial_state.lock().await;
    serial.auto_bind_serial_outputs()?;
    drop(serial);

    // Rebuild output loops
    let manager = output_loop_manager.lock().await;
    manager
        .rebuild_all_loops(
            serial_state.clone(),
            sacn_state.clone(),
            wled_state.clone(),
        )
        .await?;

    Ok(())
}

/// Saves project state with undo support and persistence.
#[tauri::command]
pub async fn save_project(
    project_binary: Vec<u8>,
    description: String,
    undoable: bool,
    app: AppHandle,
    output_loop_manager: State<'_, Arc<TokioMutex<OutputLoopManager>>>,
    serial_state: State<'_, Arc<TokioMutex<SerialState>>>,
    sacn_state: State<'_, Arc<TokioMutex<SacnState>>>,
    wled_state: State<'_, Arc<TokioMutex<WledState>>>,
) -> Result<(), String> {
    // 1. Update engine state + undo stack
    project::save(&project_binary, &description, undoable)?;

    // 2. Emit events to frontend
    emit_project_events(&app, &project_binary, &description)?;

    // 3. Persist to disk
    persist_to_disk(&app, &project_binary).await?;

    // 4. Rebuild output loops
    rebuild_outputs(
        serial_state.inner(),
        output_loop_manager.inner(),
        sacn_state.inner(),
        wled_state.inner(),
    )
    .await?;

    Ok(())
}

/// Updates project state without persistence or undo tracking.
/// Used for live updates during drag operations.
#[tauri::command]
pub async fn update_project(
    project_binary: Vec<u8>,
    app: AppHandle,
    output_loop_manager: State<'_, Arc<TokioMutex<OutputLoopManager>>>,
    serial_state: State<'_, Arc<TokioMutex<SerialState>>>,
    sacn_state: State<'_, Arc<TokioMutex<SacnState>>>,
    wled_state: State<'_, Arc<TokioMutex<WledState>>>,
) -> Result<(), String> {
    // 1. Update engine state only (no undo, no persistence)
    project::update(&project_binary)?;

    // 2. Emit project-updated event (no undo state change)
    app.emit(
        "project-updated",
        ProjectUpdatedPayload {
            project_binary: project_binary.clone(),
            description: String::new(),
        },
    )
    .map_err(|e| format!("Failed to emit project-updated: {}", e))?;

    // 3. Rebuild output loops
    rebuild_outputs(
        serial_state.inner(),
        output_loop_manager.inner(),
        sacn_state.inner(),
        wled_state.inner(),
    )
    .await?;

    Ok(())
}

/// Undoes the last operation.
#[tauri::command]
pub async fn undo_project(
    app: AppHandle,
    output_loop_manager: State<'_, Arc<TokioMutex<OutputLoopManager>>>,
    serial_state: State<'_, Arc<TokioMutex<SerialState>>>,
    sacn_state: State<'_, Arc<TokioMutex<SacnState>>>,
    wled_state: State<'_, Arc<TokioMutex<WledState>>>,
) -> Result<(), String> {
    // 1. Perform undo in engine
    let result = project::undo()?;

    // 2. Emit events to frontend
    emit_project_events(&app, &result.project_binary, &result.description)?;

    // 3. Persist the restored state
    persist_to_disk(&app, &result.project_binary).await?;

    // 4. Rebuild output loops
    rebuild_outputs(
        serial_state.inner(),
        output_loop_manager.inner(),
        sacn_state.inner(),
        wled_state.inner(),
    )
    .await?;

    Ok(())
}

/// Redoes the previously undone operation.
#[tauri::command]
pub async fn redo_project(
    app: AppHandle,
    output_loop_manager: State<'_, Arc<TokioMutex<OutputLoopManager>>>,
    serial_state: State<'_, Arc<TokioMutex<SerialState>>>,
    sacn_state: State<'_, Arc<TokioMutex<SacnState>>>,
    wled_state: State<'_, Arc<TokioMutex<WledState>>>,
) -> Result<(), String> {
    // 1. Perform redo in engine
    let result = project::redo()?;

    // 2. Emit events to frontend
    emit_project_events(&app, &result.project_binary, &result.description)?;

    // 3. Persist the restored state
    persist_to_disk(&app, &result.project_binary).await?;

    // 4. Rebuild output loops
    rebuild_outputs(
        serial_state.inner(),
        output_loop_manager.inner(),
        sacn_state.inner(),
        wled_state.inner(),
    )
    .await?;

    Ok(())
}

/// Loads a project, resetting the undo stack.
#[tauri::command]
pub async fn load_project(
    project_binary: Vec<u8>,
    app: AppHandle,
    output_loop_manager: State<'_, Arc<TokioMutex<OutputLoopManager>>>,
    serial_state: State<'_, Arc<TokioMutex<SerialState>>>,
    sacn_state: State<'_, Arc<TokioMutex<SacnState>>>,
    wled_state: State<'_, Arc<TokioMutex<WledState>>>,
) -> Result<(), String> {
    // 1. Load into engine (resets undo stack)
    project::load(&project_binary)?;

    // 2. Emit events to frontend
    emit_project_events(&app, &project_binary, "Open project")?;

    // 3. Persist to disk
    persist_to_disk(&app, &project_binary).await?;

    // 4. Rebuild output loops
    rebuild_outputs(
        serial_state.inner(),
        output_loop_manager.inner(),
        sacn_state.inner(),
        wled_state.inner(),
    )
    .await?;

    Ok(())
}

/// Returns the current undo/redo availability state.
#[tauri::command]
pub fn get_undo_state() -> Result<UndoStatePayload, String> {
    let state = project::get_undo_state()?;
    Ok(UndoStatePayload::from(state))
}
