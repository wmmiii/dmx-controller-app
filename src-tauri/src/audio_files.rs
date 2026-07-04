use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

/// Cached resources for a single audio file.
/// Will hold waveform data, playback handles, etc. when implemented.
pub struct AudioFileResources {
    // Empty for now - will be populated as features are added
}

/// Registry for managing audio file resources.
pub struct AudioFilesState {
    #[allow(dead_code)]
    resources: HashMap<u64, AudioFileResources>,
}

impl AudioFilesState {
    pub fn new() -> Self {
        Self {
            resources: HashMap::new(),
        }
    }
}

#[tauri::command]
pub async fn play_audio(
    _audio_file_id: u64,
    _state: State<'_, Arc<Mutex<AudioFilesState>>>,
) -> Result<(), String> {
    Err("Not implemented".to_string())
}

#[tauri::command]
pub async fn pause_audio(
    _audio_file_id: u64,
    _state: State<'_, Arc<Mutex<AudioFilesState>>>,
) -> Result<(), String> {
    Err("Not implemented".to_string())
}

#[tauri::command]
pub async fn seek_audio(
    _audio_id: u64,
    _time_ms: u64,
    _state: State<'_, Arc<Mutex<AudioFilesState>>>,
) -> Result<(), String> {
    Err("Not implemented".to_string())
}

#[tauri::command]
pub async fn jog_audio(
    _audio_id: u64,
    _delta_ms: i64,
    _state: State<'_, Arc<Mutex<AudioFilesState>>>,
) -> Result<(), String> {
    Err("Not implemented".to_string())
}
