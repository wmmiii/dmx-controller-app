use dmx_engine::project;
use dmx_engine::proto::FatProject;
use dmx_engine::tile::toggle_tile as engine_toggle_tile;
use dmx_engine::visualizer::utils as visualizer_utils;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex as TokioMutex;
use tokio::task::JoinHandle;

use crate::cas::{read_cas_bytes, write_cas_bytes};
use crate::event_sink::{UndoStatePayload, emit_project_update, emit_undo_state};
use dmx_runtime::ddp::DdpState;
use dmx_runtime::display_loop::DisplayLoopManager;
use dmx_runtime::output_loop::OutputLoopManager;
use dmx_runtime::sacn::SacnState;
use dmx_runtime::serial::SerialState;
use dmx_runtime::shader::ShaderState;
use dmx_runtime::wled::WledState;

const PROJECT_KEY: &str = "tmp-project-1";
const DEBOUNCE_MS: u64 = 1000;

/// Manages debounced disk persistence for project
pub struct PersistState {
    pending_project: Option<Vec<u8>>,
    debounce_handle: Option<JoinHandle<()>>,
    app_data_dir: PathBuf,
}

impl PersistState {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            pending_project: None,
            debounce_handle: None,
            app_data_dir,
        }
    }

    /// Persist the project to disk immediately, cancelling any pending debounce.
    pub fn flush_sync(&mut self) {
        // Cancel any pending debounce
        if let Some(handle) = self.debounce_handle.take() {
            handle.abort();
        }

        if let Some(data) = project::get().ok().or_else(|| self.pending_project.take()) {
            let path = self.app_data_dir.join(PROJECT_KEY);
            let _ = std::fs::write(&path, &data);
        }
    }
}

/// Loads project from disk during app startup into the engine.
/// If no project exists, creates a default project.
pub fn load_from_disk(app: &AppHandle) -> Result<(), String> {
    use dmx_engine::proto;
    use prost::Message;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;

    // Ensure directory exists
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data dir: {e}"))?;

    // Read project binary (empty vec if doesn't exist)
    let project_path = app_data_dir.join(PROJECT_KEY);
    let project_binary = std::fs::read(&project_path).unwrap_or_default();

    // If project exists, load into engine state
    if !project_binary.is_empty() {
        let project = proto::Project::decode(project_binary.as_slice())
            .map_err(|e| format!("Failed to decode project: {e}"))?;
        project::load(project)?;
    }

    // Ensure a project exists (creates default if none was loaded)
    project::ensure_project_exists()?;

    Ok(())
}

/// Schedules a debounced flush of pending writes
fn schedule_flush(persist_state: &Arc<TokioMutex<PersistState>>) -> JoinHandle<()> {
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
                log::error!("Failed to write project: {e}");
            }
        }

        // Clear the handle since we're done
        state.debounce_handle = None;
    })
}

/// Emits project update, undo state, and queues debounced persistence.
/// This is the standard way to finalize a project modification.
pub async fn emit_and_persist(
    app: &AppHandle,
    persist_state: &Arc<TokioMutex<PersistState>>,
) -> Result<(), String> {
    emit_project_update(app);
    emit_undo_state(app);

    // Queue debounced persist to disk
    let project_binary = project::get()?;
    let mut state = persist_state.lock().await;
    state.pending_project = Some(project_binary);

    // Cancel existing debounce if any
    if let Some(handle) = state.debounce_handle.take() {
        handle.abort();
    }

    // Schedule new flush and store the handle
    let handle = schedule_flush(persist_state);
    state.debounce_handle = Some(handle);

    Ok(())
}

/// Rebuilds output loops after project changes
pub async fn rebuild_outputs(
    serial_state: &Arc<TokioMutex<SerialState>>,
    output_loop_manager: &Arc<TokioMutex<OutputLoopManager>>,
    display_loop_manager: &Arc<TokioMutex<DisplayLoopManager>>,
    sacn_state: &Arc<TokioMutex<SacnState>>,
    wled_state: &Arc<TokioMutex<WledState>>,
    ddp_state: &Arc<TokioMutex<DdpState>>,
    app: &AppHandle,
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
    drop(manager);

    // Rebuild display loop
    let display_manager = display_loop_manager.lock().await;
    display_manager
        .rebuild_display_loop(ddp_state.clone())
        .await?;

    // Sync GPU shader state with project.visualizers so undo/redo/load/copy
    // all stay consistent without ad-hoc compile calls in the UI.
    if let Some(shader_state) = app.try_state::<Arc<StdMutex<ShaderState>>>() {
        dmx_runtime::shader::sync_visualizer_shaders(&shader_state);
    }

    Ok(())
}

/// Saves project state with undo support and persistence using state pulled off the `AppHandle`.
pub async fn save_project_internal(app: &AppHandle) -> Result<(), String> {
    let persist_state = app.state::<Arc<TokioMutex<PersistState>>>().inner().clone();
    let output_loop_manager = app
        .state::<Arc<TokioMutex<OutputLoopManager>>>()
        .inner()
        .clone();
    let display_loop_manager = app
        .state::<Arc<TokioMutex<DisplayLoopManager>>>()
        .inner()
        .clone();
    let serial_state = app.state::<Arc<TokioMutex<SerialState>>>().inner().clone();
    let sacn_state = app.state::<Arc<TokioMutex<SacnState>>>().inner().clone();
    let wled_state = app.state::<Arc<TokioMutex<WledState>>>().inner().clone();
    let ddp_state = app.state::<Arc<TokioMutex<DdpState>>>().inner().clone();

    emit_and_persist(app, &persist_state).await?;

    rebuild_outputs(
        &serial_state,
        &output_loop_manager,
        &display_loop_manager,
        &sacn_state,
        &wled_state,
        &ddp_state,
        app,
    )
    .await
}

/// Saves project state with undo support and persistence.
#[tauri::command]
pub async fn save_project(
    project_binary: Vec<u8>,
    description: String,
    undoable: bool,
    app: AppHandle,
) -> Result<(), String> {
    // 1. Update engine state + undo stack
    project::save_snapshot(&project_binary, &description, undoable)?;

    // 2. Emit, persist, and rebuild output loops
    save_project_internal(&app).await
}

/// Updates project state without persistence or undo tracking.
/// Used for live updates during drag operations.
#[tauri::command]
pub async fn update_project(
    project_binary: Vec<u8>,
    app: AppHandle,
    output_loop_manager: State<'_, Arc<TokioMutex<OutputLoopManager>>>,
    display_loop_manager: State<'_, Arc<TokioMutex<DisplayLoopManager>>>,
    serial_state: State<'_, Arc<TokioMutex<SerialState>>>,
    sacn_state: State<'_, Arc<TokioMutex<SacnState>>>,
    wled_state: State<'_, Arc<TokioMutex<WledState>>>,
    ddp_state: State<'_, Arc<TokioMutex<DdpState>>>,
) -> Result<(), String> {
    // 1. Update engine state only (no undo, no persistence)
    project::update(&project_binary)?;

    // 2. Emit project update (flow-controlled)
    emit_project_update(&app);

    // 3. Rebuild output loops
    rebuild_outputs(
        serial_state.inner(),
        output_loop_manager.inner(),
        display_loop_manager.inner(),
        sacn_state.inner(),
        wled_state.inner(),
        ddp_state.inner(),
        &app,
    )
    .await?;

    Ok(())
}

/// Undoes the last operation.
#[tauri::command]
pub async fn undo_project(app: AppHandle) -> Result<(), String> {
    project::undo()?;
    save_project_internal(&app).await
}

/// Redoes the previously undone operation.
#[tauri::command]
pub async fn redo_project(app: AppHandle) -> Result<(), String> {
    project::redo()?;
    save_project_internal(&app).await
}

/// Returns the current undo/redo availability state.
#[tauri::command]
pub fn get_undo_state() -> Result<UndoStatePayload, String> {
    let state = project::get_undo_state()?;
    Ok(UndoStatePayload::from(state))
}

/// Emits project-updated event with the current project state.
#[tauri::command]
#[allow(clippy::needless_pass_by_value, clippy::unnecessary_wraps)]
pub fn request_update(app: AppHandle) -> Result<(), String> {
    // Emit project update (flow-controlled) and undo state (immediate)
    emit_project_update(&app);
    emit_undo_state(&app);

    Ok(())
}

/// Exports the project by showing a native save dialog and writing the project
/// binary to the chosen path.
#[tauri::command]
pub async fn export_project(app: AppHandle) -> Result<bool, String> {
    use dmx_engine::proto;
    use prost::Message;
    use tauri_plugin_dialog::DialogExt;

    // Get the project from the engine and decode it
    let project_binary = project::get()?;
    let project = proto::Project::decode(project_binary.as_slice())
        .map_err(|e| format!("Failed to decode project: {e}"))?;

    // Get CAS entries
    let mut cas = HashMap::new();
    for track in project.tracks.values() {
        let digest = &track.digest;

        let blob = read_cas_bytes(&app, digest)?;
        cas.insert(digest.clone(), blob);
    }

    // Build default filename from project name with date stamp
    let today = chrono::Local::now().format("%Y-%m-%d");
    let default_name = sanitize_filename::sanitize(format!("{}_{}.dmxapp", project.name, today));

    // Create the fat project protocol buffer
    let fat_project = FatProject {
        project: Some(project),
        cas,
    };

    let path = app
        .dialog()
        .file()
        .set_title("Save Project")
        .set_file_name(&default_name)
        .add_filter("DMX App Project", &["dmxapp"])
        .blocking_save_file();

    match path {
        Some(path) => {
            std::fs::write(
                path.as_path().ok_or("Invalid file path")?,
                fat_project.encode_to_vec(),
            )
            .map_err(|e| format!("Failed to export project: {e}"))?;
            Ok(true)
        }
        None => Ok(false),
    }
}

/// Imports a project by showing a native open dialog, reading the file, and
/// loading the project into the engine.
#[tauri::command]
pub async fn import_project(app: AppHandle) -> Result<(), String> {
    use prost::Message;
    use tauri_plugin_dialog::DialogExt;

    let path = app
        .dialog()
        .file()
        .set_title("Open Project")
        .add_filter("DMX App Project", &["dmxapp"])
        .blocking_pick_file();

    let Some(path) = path else {
        // User cancelled the dialog.
        return Ok(());
    };

    let file_bytes = std::fs::read(path.as_path().ok_or("Invalid file path")?)
        .map_err(|e| format!("Failed to read project file: {e}"))?;

    let fat_project = FatProject::decode(file_bytes.as_slice())
        .map_err(|e| format!("Failed to decode project: {e}"))?;

    // Load CAS entries onto filesystem
    for (expected_digest, bytes) in fat_project.cas {
        let actual_digest = write_cas_bytes(&app, &bytes)?;
        if actual_digest != expected_digest {
            return Err(format!(
                "CAS digest mismatch: expected {expected_digest}, got {actual_digest}"
            ));
        }
    }

    // Load the project into the engine
    if let Some(project) = fat_project.project {
        project::load(project)?;
    } else {
        return Err("Could not load fat project, `project` field not set!".to_string());
    }

    save_project_internal(&app).await
}

/// Resets the project to a fresh default, clearing undo history.
#[tauri::command]
pub async fn new_project(app: AppHandle) -> Result<(), String> {
    project::new_project()?;
    save_project_internal(&app).await
}

/// Deletes a user visualizer.
#[tauri::command]
pub async fn delete_visualizer(id: String, app: AppHandle) -> Result<(), String> {
    let id: u64 = id
        .parse()
        .map_err(|_| format!("Invalid visualizer id: {id}"))?;

    let name = project::with_project(|p| Ok(p.visualizers.get(&id).map(|v| v.name.clone())))?
        .ok_or_else(|| format!("No visualizer with id {id}"))?;
    let description = format!("Delete visualizer \"{name}\".");

    project::save(&description, true, |p| {
        if visualizer_utils::delete_visualizer(p, id) {
            Ok(())
        } else {
            Err(format!("No visualizer with id {id}"))
        }
    })?;

    save_project_internal(&app).await
}

/// Toggles a tile on/off based on its current state.
/// Returns whether the tile was enabled (true) or disabled (false).
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn toggle_tile(scene_id: String, tile_id: String, app: AppHandle) -> Result<bool, String> {
    let scene_id: u64 = scene_id.parse().map_err(|_| "Invalid scene_id")?;
    let tile_id: u64 = tile_id.parse().map_err(|_| "Invalid tile_id")?;

    #[allow(clippy::cast_possible_truncation)]
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;

    let (modified, enabled) = project::with_project_mut(|project| {
        let beat = match &project.live_beat {
            Some(b) => *b,
            None => return Ok((false, false)),
        };

        let scene = project.scenes.get_mut(&scene_id).ok_or("Scene not found")?;

        let tile_entry = scene
            .tile_map
            .iter_mut()
            .find(|tm| tm.id == tile_id)
            .ok_or("Tile not found")?;

        let tile = tile_entry.tile.as_mut().ok_or("Tile entry has no tile")?;

        engine_toggle_tile(tile, &beat, t);

        // Determine if tile is now enabled based on transition state
        let enabled = matches!(
            tile.transition,
            Some(dmx_engine::proto::scene::tile::Transition::StartFadeInMs(_))
        );

        Ok((true, enabled))
    })?;

    if modified {
        // Transient: emit to the webview, but no undo entry or disk write.
        emit_project_update(&app);
    }

    Ok(enabled)
}
