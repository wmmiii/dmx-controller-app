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
