use dmx_engine::project;
use dmx_engine::proto::FatProject;
use dmx_engine::tile::toggle_tile as engine_toggle_tile;
use dmx_engine::visualizer::utils as visualizer_utils;
use dmx_runtime::runtime::Runtime;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, State};

use crate::cas::{read_cas_bytes, write_cas_bytes};
use crate::event_sink::UndoStatePayload;

/// Saves project state with undo support and persistence.
#[tauri::command]
pub async fn save_project(
    project_binary: Vec<u8>,
    description: String,
    undoable: bool,
    runtime: State<'_, Arc<Runtime>>,
) -> Result<(), String> {
    // 1. Update engine state + undo stack
    project::save_snapshot(&project_binary, &description, undoable)?;

    // 2. Emit, persist, and rebuild output loops
    runtime.finalize_project_modification().await
}

/// Updates project state without persistence or undo tracking.
/// Used for live updates during drag operations.
#[tauri::command]
pub async fn update_project(
    project_binary: Vec<u8>,
    runtime: State<'_, Arc<Runtime>>,
) -> Result<(), String> {
    project::update(&project_binary)?;

    runtime.notify_and_rebuild().await
}

/// Undoes the last operation.
#[tauri::command]
pub async fn undo_project(runtime: State<'_, Arc<Runtime>>) -> Result<(), String> {
    project::undo()?;
    runtime.finalize_project_modification().await
}

/// Redoes the previously undone operation.
#[tauri::command]
pub async fn redo_project(runtime: State<'_, Arc<Runtime>>) -> Result<(), String> {
    project::redo()?;
    runtime.finalize_project_modification().await
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
pub fn request_update(runtime: State<'_, Arc<Runtime>>) -> Result<(), String> {
    // Emit project update (flow-controlled) and undo state (immediate)
    runtime.events.project_updated();
    runtime.events.undo_state_changed();

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
pub async fn import_project(
    app: AppHandle,
    runtime: State<'_, Arc<Runtime>>,
) -> Result<(), String> {
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

    runtime.finalize_project_modification().await
}

/// Resets the project to a fresh default, clearing undo history.
#[tauri::command]
pub async fn new_project(runtime: State<'_, Arc<Runtime>>) -> Result<(), String> {
    project::new_project()?;
    runtime.finalize_project_modification().await
}

/// Deletes a user visualizer.
#[tauri::command]
pub async fn delete_visualizer(
    id: String,
    runtime: State<'_, Arc<Runtime>>,
) -> Result<(), String> {
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

    runtime.finalize_project_modification().await
}

/// Toggles a tile on/off based on its current state.
/// Returns whether the tile was enabled (true) or disabled (false).
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn toggle_tile(
    scene_id: String,
    tile_id: String,
    runtime: State<'_, Arc<Runtime>>,
) -> Result<bool, String> {
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
        runtime.events.project_updated();
    }

    Ok(enabled)
}
