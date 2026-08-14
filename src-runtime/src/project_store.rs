use dmx_engine::project;
use dmx_engine::proto::Project;
use prost::Message;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::task::JoinHandle;

const PROJECT_KEY: &str = "tmp-project-1";
const DEBOUNCE_MS: u64 = 1000;

/// Where the project lives between runs.
pub trait ProjectStore: Send + Sync + 'static {
    /// Loads the stored project into the engine. Must leave a usable project
    /// behind, so a store with nothing to load creates a fresh default.
    fn load(&self) -> Result<(), String>;
    fn queue_write(&self, project_binary: Vec<u8>);
    fn flush_sync(&self);
}

#[derive(Default)]
struct Pending {
    project_binary: Option<Vec<u8>>,
    debounce: Option<JoinHandle<()>>,
}

pub struct DiskProjectStore {
    path: PathBuf,
    pending: Arc<Mutex<Pending>>,
}

impl DiskProjectStore {
    #[must_use]
    pub fn new(app_data_dir: &Path) -> Self {
        Self {
            path: app_data_dir.join(PROJECT_KEY),
            pending: Arc::new(Mutex::new(Pending::default())),
        }
    }

    fn lock_pending(&self) -> std::sync::MutexGuard<'_, Pending> {
        self.pending.lock().unwrap_or_else(|e| {
            log::error!("Project store lock poisoned, recovering");
            e.into_inner()
        })
    }
}

fn write(path: &Path, data: &[u8]) {
    if let Err(e) = std::fs::write(path, data) {
        log::error!("Failed to write project: {e}");
    }
}

impl ProjectStore for DiskProjectStore {
    /// Loads the autosave into the engine. An absent or truncated autosave
    /// yields a fresh default project — never a zero-valued `Project`, which
    /// decodes happily from empty bytes but carries no scenes or palettes.
    fn load(&self) -> Result<(), String> {
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir)
                .map_err(|e| format!("Failed to create app data dir: {e}"))?;
        }

        let project_binary = match std::fs::read(&self.path) {
            Ok(bytes) => bytes,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Vec::new(),
            Err(e) => {
                return Err(format!(
                    "Failed to read project at {}: {e}",
                    self.path.display()
                ));
            }
        };

        if project_binary.is_empty() {
            project::new_project()?;
            return Ok(());
        }

        let project = Project::decode(project_binary.as_slice())
            .map_err(|e| format!("Failed to decode project: {e}"))?;
        project::load(project)?;

        // Backstop for an autosave that decoded but carries nothing.
        project::ensure_project_exists()?;

        Ok(())
    }

    fn queue_write(&self, project_binary: Vec<u8>) {
        let mut pending = self.lock_pending();
        pending.project_binary = Some(project_binary);

        if let Some(handle) = pending.debounce.take() {
            handle.abort();
        }

        let shared = Arc::clone(&self.pending);
        let path = self.path.clone();
        pending.debounce = Some(tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(DEBOUNCE_MS)).await;

            let mut pending = shared.lock().unwrap_or_else(|e| {
                log::error!("Project store lock poisoned, recovering");
                e.into_inner()
            });
            if let Some(data) = pending.project_binary.take() {
                write(&path, &data);
            }
            pending.debounce = None;
        }));
    }

    /// Writes immediately, cancelling any pending debounce. Prefers live engine
    /// state over the queued snapshot so an exit never persists a stale project.
    fn flush_sync(&self) {
        let mut pending = self.lock_pending();

        if let Some(handle) = pending.debounce.take() {
            handle.abort();
        }

        if let Some(data) = project::get().ok().or_else(|| pending.project_binary.take()) {
            write(&self.path, &data);
        }
    }
}
