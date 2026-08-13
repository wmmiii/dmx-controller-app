use dmx_engine::project;
use dmx_engine::proto::Project;
use prost::Message;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::task::JoinHandle;

const PROJECT_KEY: &str = "tmp-project-1";
const DEBOUNCE_MS: u64 = 1000;

/// Somewhere to write the project back to. Read-only hosts have none.
pub trait ProjectStore: Send + Sync + 'static {
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

    /// Loads the autosaved project into the engine, falling back to a fresh
    /// default when nothing has been saved yet.
    pub fn load(&self) -> Result<(), String> {
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir)
                .map_err(|e| format!("Failed to create app data dir: {e}"))?;
        }

        let project_binary = std::fs::read(&self.path).unwrap_or_default();
        if !project_binary.is_empty() {
            let project = Project::decode(project_binary.as_slice())
                .map_err(|e| format!("Failed to decode project: {e}"))?;
            project::load(project)?;
        }

        project::ensure_project_exists()?;

        Ok(())
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
