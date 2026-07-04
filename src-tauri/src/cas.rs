use std::path::PathBuf;
use std::sync::Arc;

use dmx_engine::project::{self, rand_id};
use dmx_engine::proto::AudioFile;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

use crate::project::{PersistState, emit_and_persist};

/// Imports a new audio file into the project.
#[tauri::command]
pub async fn import_audio_file(
    app: AppHandle,
    persist_state: State<'_, Arc<Mutex<PersistState>>>,
) -> Result<Option<u64>, String> {
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

    // Check if an AudioFile with the same digest already exists
    if let Some(id) = project::with_project(|proj| {
        Ok(proj
            .audio_files
            .iter()
            .find(|(_, audio)| audio.digest == file_digest)
            .map(|(id, _)| *id))
    })? {
        return Ok(Some(id));
    }

    // Generate a random ID for the audio file
    let audio_id = rand_id();

    // Create the AudioFile and add it to the project
    let audio_file = AudioFile {
        name: display_name,
        original_file_name: file_name.clone(),
        digest: file_digest,
        mime,
        beat_keyframes: Vec::new(),
    };

    project::with_project_mut(|proj| {
        proj.audio_files.insert(audio_id, audio_file);
        Ok(())
    })?;

    // Emit project update and persist to disk
    emit_and_persist(
        &app,
        Some(format!("Import audio file: {file_name}")),
        persist_state.inner(),
    )
    .await?;

    Ok(Some(audio_id))
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
