use dmx_engine::project::{self, UndoState};
use dmx_engine::tile::toggle_tile as engine_toggle_tile;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex as TokioMutex;
use tokio::task::JoinHandle;

use crate::output_loop::OutputLoopManager;
use crate::sacn::SacnState;
use crate::serial::SerialState;
use crate::wled::WledState;

// =============================================================================
// Flow control for project updates to frontend
// =============================================================================
//
// This prevents overwhelming the frontend with rapid updates (e.g., from MIDI).
//
// Protocol:
// 1. Frontend signals "ready" when it can accept an update
// 2. Backend sets "dirty" when project changes via mark_project_dirty_and_maybe_emit
// 3. When both flags are set, we send an update and clear both
// 4. Frontend signals "ready" again after processing

static PROJECT_DIRTY: AtomicBool = AtomicBool::new(false);
static FRONTEND_READY: AtomicBool = AtomicBool::new(true); // Start ready for initial update

const PROJECT_KEY: &str = "tmp-project-1";
const ASSETS_KEY: &str = "tmp-assets-1";
const DEBOUNCE_MS: u64 = 1000;

/// Manages debounced disk persistence for project and assets
pub struct PersistState {
    pending_project: Option<Vec<u8>>,
    pending_assets: Option<Vec<u8>>,
    debounce_handle: Option<JoinHandle<()>>,
    app_data_dir: PathBuf,
}

impl PersistState {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            pending_project: None,
            pending_assets: None,
            debounce_handle: None,
            app_data_dir,
        }
    }

    /// Flush any pending writes immediately (called on app exit)
    pub fn flush_sync(&mut self) {
        // Cancel any pending debounce
        if let Some(handle) = self.debounce_handle.take() {
            handle.abort();
        }

        // Write pending project
        if let Some(data) = self.pending_project.take() {
            let path = self.app_data_dir.join(PROJECT_KEY);
            let _ = std::fs::write(&path, &data);
        }

        // Write pending assets
        if let Some(data) = self.pending_assets.take() {
            let path = self.app_data_dir.join(ASSETS_KEY);
            let _ = std::fs::write(&path, &data);
        }
    }
}

/// Loads project from disk during app startup into the engine.
/// If no project exists, creates a default project.
pub fn load_from_disk(app: &AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    // Ensure directory exists
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    // Read project binary (empty vec if doesn't exist)
    let project_path = app_data_dir.join(PROJECT_KEY);
    let project_binary = std::fs::read(&project_path).unwrap_or_default();

    // If project exists, load into engine state
    if !project_binary.is_empty() {
        project::load(&project_binary)?;
    }

    // Ensure a project exists (creates default if none was loaded)
    project::ensure_project_exists()?;

    Ok(())
}

/// Schedules a debounced flush of pending writes
fn schedule_flush(persist_state: Arc<TokioMutex<PersistState>>) {
    let persist_state_clone = persist_state.clone();
    tokio::spawn(async move {
        // Wait for debounce period
        tokio::time::sleep(Duration::from_millis(DEBOUNCE_MS)).await;

        // Perform the flush
        let mut state = persist_state_clone.lock().await;

        // Write pending project
        if let Some(data) = state.pending_project.take() {
            let path = state.app_data_dir.join(PROJECT_KEY);
            if let Err(e) = std::fs::write(&path, &data) {
                log::error!("Failed to write project: {}", e);
            }
        }

        // Write pending assets
        if let Some(data) = state.pending_assets.take() {
            let path = state.app_data_dir.join(ASSETS_KEY);
            if let Err(e) = std::fs::write(&path, &data) {
                log::error!("Failed to write assets: {}", e);
            }
        }

        // Clear the handle since we're done
        state.debounce_handle = None;
    });
}

/// Queues project binary for debounced persistence
async fn queue_project_persist(
    project_binary: &[u8],
    persist_state: &Arc<TokioMutex<PersistState>>,
) {
    let mut state = persist_state.lock().await;
    state.pending_project = Some(project_binary.to_vec());

    // Cancel existing debounce if any
    if let Some(handle) = state.debounce_handle.take() {
        handle.abort();
    }

    // Schedule new flush
    drop(state); // Release lock before spawning
    schedule_flush(persist_state.clone());
}

/// Queues assets binary for debounced persistence
async fn queue_assets_persist(assets_binary: &[u8], persist_state: &Arc<TokioMutex<PersistState>>) {
    let mut state = persist_state.lock().await;
    state.pending_assets = Some(assets_binary.to_vec());

    // Cancel existing debounce if any
    if let Some(handle) = state.debounce_handle.take() {
        handle.abort();
    }

    // Schedule new flush
    drop(state); // Release lock before spawning
    schedule_flush(persist_state.clone());
}

/// Payload for the project-updated event
#[derive(Clone, Serialize)]
struct ProjectUpdatedPayload {
    project_binary: Vec<u8>,
    description: Option<String>,
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

/// Emits a project-updated event (low-level, called when frontend is ready).
fn emit_project_update_impl(app: &AppHandle, description: Option<String>) {
    if let Ok(project_binary) = project::get() {
        let _ = app.emit(
            "project-updated",
            ProjectUpdatedPayload {
                project_binary,
                description,
            },
        );
    }
}

/// Emits undo-state-changed event. Called separately from project updates
/// since undo state changes are infrequent and should be immediate.
fn emit_undo_state(app: &AppHandle) {
    if let Ok(undo_state) = project::get_undo_state() {
        let _ = app.emit("undo-state-changed", UndoStatePayload::from(undo_state));
    }
}

/// Marks the project as dirty and emits update if frontend is ready.
/// This is the single entry point for all project update emissions.
pub fn emit_project_update(app_handle: &AppHandle, description: Option<String>) {
    // Set dirty flag
    PROJECT_DIRTY.store(true, Ordering::Release);

    // Check if frontend is ready (and clear the flag atomically if so)
    if FRONTEND_READY.swap(false, Ordering::AcqRel) {
        // Frontend was ready - send update now
        PROJECT_DIRTY.store(false, Ordering::Release);
        emit_project_update_impl(app_handle, description);
    }
    // Otherwise, update will be sent when frontend signals ready
}

/// Called by frontend when it's ready for the next project update.
#[tauri::command]
pub async fn frontend_ready_for_update(app: AppHandle) -> Result<(), String> {
    // Set ready flag
    FRONTEND_READY.store(true, Ordering::Release);

    // Check if project is dirty (and clear the flag atomically if so)
    if PROJECT_DIRTY.swap(false, Ordering::AcqRel) {
        // Project was dirty - send update now
        FRONTEND_READY.store(false, Ordering::Release);
        emit_project_update_impl(&app, None);
    }
    // Otherwise, update will be sent when project changes

    Ok(())
}

/// Rebuilds output loops after project changes
pub async fn rebuild_outputs(
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
        .rebuild_all_loops(serial_state.clone(), sacn_state.clone(), wled_state.clone())
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
    persist_state: State<'_, Arc<TokioMutex<PersistState>>>,
    output_loop_manager: State<'_, Arc<TokioMutex<OutputLoopManager>>>,
    serial_state: State<'_, Arc<TokioMutex<SerialState>>>,
    sacn_state: State<'_, Arc<TokioMutex<SacnState>>>,
    wled_state: State<'_, Arc<TokioMutex<WledState>>>,
) -> Result<(), String> {
    // 1. Update engine state + undo stack
    project::save(&project_binary, &description, undoable)?;

    // 2. Emit project update (flow-controlled) and undo state (immediate)
    emit_project_update(&app, Some(description));
    emit_undo_state(&app);

    // 3. Queue debounced persist to disk
    queue_project_persist(&project_binary, persist_state.inner()).await;

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

    // 2. Emit project update (flow-controlled)
    emit_project_update(&app, None);

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
    persist_state: State<'_, Arc<TokioMutex<PersistState>>>,
    output_loop_manager: State<'_, Arc<TokioMutex<OutputLoopManager>>>,
    serial_state: State<'_, Arc<TokioMutex<SerialState>>>,
    sacn_state: State<'_, Arc<TokioMutex<SacnState>>>,
    wled_state: State<'_, Arc<TokioMutex<WledState>>>,
) -> Result<(), String> {
    // 1. Perform undo in engine
    let result = project::undo()?;

    // 2. Emit project update (flow-controlled) and undo state (immediate)
    emit_project_update(&app, Some(result.description));
    emit_undo_state(&app);

    // 3. Queue debounced persist to disk
    queue_project_persist(&result.project_binary, persist_state.inner()).await;

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
    persist_state: State<'_, Arc<TokioMutex<PersistState>>>,
    output_loop_manager: State<'_, Arc<TokioMutex<OutputLoopManager>>>,
    serial_state: State<'_, Arc<TokioMutex<SerialState>>>,
    sacn_state: State<'_, Arc<TokioMutex<SacnState>>>,
    wled_state: State<'_, Arc<TokioMutex<WledState>>>,
) -> Result<(), String> {
    // 1. Perform redo in engine
    let result = project::redo()?;

    // 2. Emit project update (flow-controlled) and undo state (immediate)
    emit_project_update(&app, Some(result.description));
    emit_undo_state(&app);

    // 3. Queue debounced persist to disk
    queue_project_persist(&result.project_binary, persist_state.inner()).await;

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
    persist_state: State<'_, Arc<TokioMutex<PersistState>>>,
    output_loop_manager: State<'_, Arc<TokioMutex<OutputLoopManager>>>,
    serial_state: State<'_, Arc<TokioMutex<SerialState>>>,
    sacn_state: State<'_, Arc<TokioMutex<SacnState>>>,
    wled_state: State<'_, Arc<TokioMutex<WledState>>>,
) -> Result<(), String> {
    // 1. Load into engine (resets undo stack)
    project::load(&project_binary)?;

    // 2. Emit project update (flow-controlled) and undo state (immediate)
    emit_project_update(&app, Some("Load project.".to_string()));
    emit_undo_state(&app);

    // 3. Queue debounced persist to disk
    queue_project_persist(&project_binary, persist_state.inner()).await;

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

/// Emits project-updated event with the current project state.
/// TODO: Add lazy asset fetching - frontend will request assets on-demand as needed.
#[tauri::command]
pub fn request_update(app: AppHandle) -> Result<(), String> {
    // Emit project update (flow-controlled) and undo state (immediate)
    emit_project_update(&app, None);
    emit_undo_state(&app);

    Ok(())
}

/// Saves assets binary to disk with debounced persistence.
#[tauri::command]
pub async fn save_assets(
    assets_binary: Vec<u8>,
    persist_state: State<'_, Arc<TokioMutex<PersistState>>>,
) -> Result<(), String> {
    queue_assets_persist(&assets_binary, persist_state.inner()).await;
    Ok(())
}

/// Toggles a tile on/off based on its current state.
/// Returns whether the tile was enabled (true) or disabled (false).
#[tauri::command]
pub async fn toggle_tile(
    scene_id: String,
    tile_id: String,
    app: AppHandle,
    persist_state: State<'_, Arc<TokioMutex<PersistState>>>,
) -> Result<bool, String> {
    let scene_id: u64 = scene_id.parse().map_err(|_| "Invalid scene_id")?;
    let tile_id: u64 = tile_id.parse().map_err(|_| "Invalid tile_id")?;

    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;

    let (modified, enabled, description) = project::with_project_mut(|project| {
        let beat = match &project.live_beat {
            Some(b) => b.clone(),
            None => return Ok((false, false, String::new())),
        };

        let scene = project.scenes.get_mut(&scene_id).ok_or("Scene not found")?;

        let tile_entry = scene
            .tile_map
            .iter_mut()
            .find(|tm| tm.id == tile_id)
            .ok_or("Tile not found")?;

        let tile = tile_entry.tile.as_mut().ok_or("Tile entry has no tile")?;

        let tile_name = tile.name.clone();

        engine_toggle_tile(tile, &beat, t);

        // Determine if tile is now enabled based on transition state
        let enabled = matches!(
            tile.transition,
            Some(dmx_engine::proto::scene::tile::Transition::StartFadeInMs(_))
        );

        let description = format!(
            "{} tile {}.",
            if enabled { "Enable" } else { "Disable" },
            tile_name
        );

        Ok((true, enabled, description))
    })?;

    if modified {
        // Emit project update (flow-controlled)
        emit_project_update(&app, Some(description));

        // Queue debounced persist to disk
        let project_binary = project::get()?;
        queue_project_persist(&project_binary, persist_state.inner()).await;
    }

    Ok(enabled)
}
