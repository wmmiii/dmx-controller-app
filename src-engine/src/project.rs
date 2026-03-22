use std::sync::Mutex;

use once_cell::sync::Lazy;
use prost::Message;

use crate::proto::Project;

const MAX_UNDO: usize = 100;

/// Represents a single operation in the undo stack
struct Operation {
    /// Binary protobuf representation of the project state (without assets)
    project_state: Vec<u8>,
    /// Human-readable description of the operation
    description: String,
}

/// Represents the current undo/redo availability state
#[derive(Debug, Clone)]
pub struct UndoState {
    pub can_undo: bool,
    pub can_redo: bool,
    pub undo_description: Option<String>,
    pub redo_description: Option<String>,
}

/// Result returned from undo/redo operations
#[derive(Debug)]
pub struct UndoRedoResult {
    /// Binary protobuf of the restored project state
    pub project_binary: Vec<u8>,
    /// Description of the operation that was undone/redone
    pub description: String,
}

/// Internal state for project management
struct ProjectState {
    /// Current project state
    project: Project,
    /// Stack of previous states for undo/redo
    operation_stack: Vec<Operation>,
    /// Current position in the operation stack (-1 means no operations yet)
    operation_index: i32,
}

/// Global project state - the authoritative source of truth
static PROJECT_STATE: Lazy<Mutex<ProjectState>> = Lazy::new(|| {
    Mutex::new(ProjectState {
        project: Project::default(),
        operation_stack: Vec::new(),
        operation_index: -1,
    })
});

/// Saves a new project state, optionally adding to the undo stack.
///
/// # Arguments
/// * `project_binary` - Binary protobuf representation of the project
/// * `description` - Human-readable description of the change
/// * `undoable` - Whether this operation should be added to the undo stack
pub fn save(project_binary: &[u8], description: &str, undoable: bool) -> Result<(), String> {
    let project =
        Project::decode(project_binary).map_err(|e| format!("Failed to decode project: {}", e))?;

    let mut state = PROJECT_STATE
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    // Update the current project state
    state.project = project;

    // Add to undo stack if undoable
    if undoable {
        // Remove any redo operations (everything after current index)
        let current_idx = (state.operation_index + 1) as usize;
        if current_idx < state.operation_stack.len() {
            state.operation_stack.truncate(current_idx);
        }

        // Push the new operation
        state.operation_stack.push(Operation {
            project_state: project_binary.to_vec(),
            description: description.to_string(),
        });

        // Enforce MAX_UNDO limit
        if state.operation_stack.len() > MAX_UNDO {
            state.operation_stack.remove(0);
        } else {
            state.operation_index += 1;
        }
    }

    Ok(())
}

/// Updates project state without persistence or undo tracking.
/// Used for live updates (e.g., MIDI continuous inputs causing the project to update rapidly).
///
/// # Arguments
/// * `project_binary` - Binary protobuf representation of the project
pub fn update(project_binary: &[u8]) -> Result<(), String> {
    let project =
        Project::decode(project_binary).map_err(|e| format!("Failed to decode project: {}", e))?;

    let mut state = PROJECT_STATE
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    state.project = project;

    Ok(())
}

/// Undoes the last operation, restoring the previous state.
/// Returns the restored project binary and description if successful.
pub fn undo() -> Result<UndoRedoResult, String> {
    let mut state = PROJECT_STATE
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    if state.operation_index <= 0 {
        return Err("Nothing to undo".to_string());
    }

    // Get the description of what we're undoing
    let undo_description = state.operation_stack[state.operation_index as usize]
        .description
        .clone();

    // Move index back and get previous state
    state.operation_index -= 1;
    let prev_state = &state.operation_stack[state.operation_index as usize];

    // Decode and update current project
    let project = Project::decode(&prev_state.project_state[..])
        .map_err(|e| format!("Failed to decode project: {}", e))?;

    let result = UndoRedoResult {
        project_binary: prev_state.project_state.clone(),
        description: format!("Undo: {}", undo_description),
    };

    state.project = project;

    Ok(result)
}

/// Redoes the previously undone operation.
/// Returns the restored project binary and description if successful.
pub fn redo() -> Result<UndoRedoResult, String> {
    let mut state = PROJECT_STATE
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    if state.operation_index >= (state.operation_stack.len() as i32) - 1 {
        return Err("Nothing to redo".to_string());
    }

    // Move index forward
    state.operation_index += 1;
    let next_state = &state.operation_stack[state.operation_index as usize];

    // Decode and update current project
    let project = Project::decode(&next_state.project_state[..])
        .map_err(|e| format!("Failed to decode project: {}", e))?;

    let result = UndoRedoResult {
        project_binary: next_state.project_state.clone(),
        description: format!("Redo: {}", next_state.description),
    };

    state.project = project;

    Ok(result)
}

/// Loads a project, resetting the undo stack.
/// Used when opening a new project or initializing from storage.
///
/// # Arguments
/// * `project_binary` - Binary protobuf representation of the project
pub fn load(project_binary: &[u8]) -> Result<(), String> {
    let project =
        Project::decode(project_binary).map_err(|e| format!("Failed to decode project: {}", e))?;

    let mut state = PROJECT_STATE
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    state.project = project;

    // Reset the undo stack with this as the initial state
    state.operation_stack.clear();
    state.operation_stack.push(Operation {
        project_state: project_binary.to_vec(),
        description: "Open project".to_string(),
    });
    state.operation_index = 0;

    Ok(())
}

/// Returns the current undo/redo availability state.
pub fn get_undo_state() -> Result<UndoState, String> {
    let state = PROJECT_STATE
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    let can_undo = state.operation_index > 0;
    let can_redo = state.operation_index < (state.operation_stack.len() as i32) - 1;

    let undo_description = if can_undo {
        Some(
            state.operation_stack[state.operation_index as usize]
                .description
                .clone(),
        )
    } else {
        None
    };

    let redo_description = if can_redo {
        Some(
            state.operation_stack[(state.operation_index + 1) as usize]
                .description
                .clone(),
        )
    } else {
        None
    };

    Ok(UndoState {
        can_undo,
        can_redo,
        undo_description,
        redo_description,
    })
}

/// Executes a closure with a reference to the current project state.
/// This avoids cloning the project, making it suitable for hot paths like rendering.
///
/// The lock is held for the duration of the closure, so callers should
/// avoid blocking operations or acquiring other locks within the closure.
pub fn with_project<T, F>(f: F) -> Result<T, String>
where
    F: FnOnce(&Project) -> Result<T, String>,
{
    let state = PROJECT_STATE
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;
    f(&state.project)
}

/// Returns the current project as a binary protobuf.
pub fn get() -> Result<Vec<u8>, String> {
    let state = PROJECT_STATE
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;
    Ok(state.project.encode_to_vec())
}

/// Creates and loads a default project if none exists.
/// Returns true if a new project was created, false if one already existed.
pub fn ensure_project_exists() -> Result<bool, String> {
    let mut state = PROJECT_STATE
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    // Check if project already has a name (meaning it was loaded)
    if !state.project.name.is_empty() {
        return Ok(false);
    }

    // Create default project with minimal required fields
    let default_project = create_default_project();
    let project_binary = default_project.encode_to_vec();

    state.project = default_project;

    // Initialize undo stack with this as the first state
    state.operation_stack.clear();
    state.operation_stack.push(Operation {
        project_state: project_binary,
        description: "New project".to_string(),
    });
    state.operation_index = 0;

    Ok(true)
}

/// Creates a minimal default project.
fn create_default_project() -> Project {
    use crate::proto::{
        BeatMetadata, Color, ColorPalette, Patch, Scene, color_palette::ColorDescription,
    };
    use std::collections::HashMap;

    let default_id = rand_id();
    let palette_id = rand_id();

    let mut color_palettes = HashMap::new();
    color_palettes.insert(
        palette_id,
        ColorPalette {
            name: "Default".to_string(),
            primary: Some(ColorDescription {
                color: Some(Color {
                    red: 1.0,
                    green: 0.0,
                    blue: 1.0,
                    white: None,
                }),
            }),
            secondary: Some(ColorDescription {
                color: Some(Color {
                    red: 0.0,
                    green: 1.0,
                    blue: 1.0,
                    white: None,
                }),
            }),
            tertiary: Some(ColorDescription {
                color: Some(Color {
                    red: 1.0,
                    green: 1.0,
                    blue: 0.0,
                    white: None,
                }),
            }),
        },
    );

    let mut scenes = HashMap::new();
    scenes.insert(
        default_id,
        Scene {
            name: "Default scene".to_string(),
            color_palettes,
            active_color_palette: palette_id,
            last_active_color_palette: palette_id,
            color_palette_transition_duration_ms: 3000,
            ..Default::default()
        },
    );

    let mut patches = HashMap::new();
    patches.insert(
        default_id,
        Patch {
            name: "Default Patch".to_string(),
            ..Default::default()
        },
    );

    Project {
        name: "Untitled Project".to_string(),
        active_scene: default_id,
        scenes,
        active_patch: default_id,
        patches,
        live_beat: Some(BeatMetadata {
            length_ms: 500.0, // 120 BPM
            offset_ms: 0,
        }),
        ..Default::default()
    }
}

/// Generates a random u64 ID.
fn rand_id() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    // Combine time with a simple counter for uniqueness
    duration.as_nanos() as u64 ^ (duration.as_micros() as u64).wrapping_mul(31)
}
