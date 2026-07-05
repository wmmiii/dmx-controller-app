use std::path::PathBuf;
use std::sync::Arc;

use dmx_engine::project::{self, rand_id};
use dmx_engine::proto::Track;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

use crate::project::{PersistState, emit_and_persist};

/// Imports a new audio file into the project.
///
/// Returns the track ID as a string since u64 values above 2^53 lose
/// precision when parsed as a JSON number on the frontend.
#[tauri::command]
pub async fn import_audio_file(
    app: AppHandle,
    persist_state: State<'_, Arc<Mutex<PersistState>>>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let path = app
        .dialog()
        .file()
        .set_title("Import Audio File")
        .add_filter("Audio Files", &["mp3", "wav", "ogg", "flac", "m4a", "aac"])
        .blocking_pick_file();

    let Some(file_path) = path else {
        // User cancelled the dialog.
        return Ok(None);
    };

    let path_ref = file_path.as_path().ok_or("Invalid file path")?;

    // Extract filename for display name (without extension)
    let display_name = path_ref
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("Untitled")
        .to_string();

    // Keep original filename with extension
    let file_name = path_ref
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Untitled")
        .to_string();

    let mime = mime_guess::from_path(path_ref)
        .first()
        .ok_or("Could not determine MIME type from file extension")?
        .to_string();

    let file_digest =
        sha256::try_digest(path_ref).map_err(|e| format!("Failed to hash audio file: {e}"))?;

    let cas_dir = get_cas_path(&app)?;
    let cas_file_path = cas_dir.join(&file_digest);

    // Copy to CAS if the file doesn't already exist (may have been deleted)
    if !cas_file_path.exists() {
        std::fs::copy(path_ref, &cas_file_path)
            .map_err(|e| format!("Failed to copy audio file: {e}"))?;
    }

    // Check if an Track with the same digest already exists
    if let Some(id) = project::with_project(|proj| {
        Ok(proj
            .tracks
            .iter()
            .find(|(_, track)| track.digest == file_digest)
            .map(|(id, _)| *id))
    })? {
        return Ok(Some(id.to_string()));
    }

    // Generate a random ID for the track
    let track_id = rand_id();

    // Create the Track and add it to the project
    let track = Track {
        name: display_name,
        original_file_name: file_name.clone(),
        digest: file_digest,
        mime,
        beat_keyframes: Vec::new(),
    };

    project::with_project_mut(|proj| {
        proj.tracks.insert(track_id, track);
        Ok(())
    })?;

    // Emit project update and persist to disk
    emit_and_persist(
        &app,
        Some(format!("Import audio file: {file_name}")),
        persist_state.inner(),
    )
    .await?;

    Ok(Some(track_id.to_string()))
}

/// Returns the raw bytes of a CAS blob by digest.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn read_cas_blob(app: AppHandle, digest: &str) -> Result<tauri::ipc::Response, String> {
    if digest.is_empty() || !digest.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(format!("Invalid CAS digest: {digest}"));
    }
    let path = get_blob_path(&app, digest)?;
    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read blob {digest}: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

fn get_cas_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;

    let cas_dir = app_data_dir.join("cas");

    // Ensure directory exists
    std::fs::create_dir_all(&cas_dir).map_err(|e| format!("Failed to create app data dir: {e}"))?;

    Ok(cas_dir)
}

fn get_blob_path(app: &AppHandle, digest: &str) -> Result<PathBuf, String> {
    let cas_dir = get_cas_path(app)?;

    Ok(cas_dir.join(digest))
}
