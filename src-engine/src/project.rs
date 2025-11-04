use std::sync::Mutex;

use once_cell::sync::Lazy;

use crate::proto::Project;

/// Global static project instance
/// Can be accessed from both WASM and Tauri contexts
pub static PROJECT_REF: Lazy<Mutex<Project>> = Lazy::new(|| Mutex::new(Project::default()));
