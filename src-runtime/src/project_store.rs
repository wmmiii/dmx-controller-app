use dmx_engine::project;
use dmx_engine::proto::Project;
use prost::Message;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::task::JoinHandle;

const PROJECT_KEY: &str = "tmp-project-1";
const DEBOUNCE_MS: u64 = 1000;

/// Where the project lives between runs — a filesystem today, a network
/// service just as well.
pub trait ProjectStore: Send + Sync + 'static {
    /// `None` when the store holds no project yet. Deciding what to do about
    /// that is the caller's business, not the store's.
    fn load(&self) -> Result<Option<Project>, String>;
    fn queue_write(&self, project: &Project);
    fn flush_sync(&self, project: &Project);
}

/// Puts `store`'s project into the engine, creating a default when the store
/// has nothing saved.
pub fn load_into_engine(store: &dyn ProjectStore) -> Result<(), String> {
    match store.load()? {
        Some(stored) => project::load(stored)?,
        None => {
            project::new_project()?;
        }
    }

    // Backstop for a stored project that decoded but carries nothing.
    project::ensure_project_exists()?;

    Ok(())
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
    if let Some(dir) = path.parent()
        && let Err(e) = std::fs::create_dir_all(dir)
    {
        log::error!("Failed to create project directory: {e}");
        return;
    }

    if let Err(e) = std::fs::write(path, data) {
        log::error!("Failed to write project: {e}");
    }
}

impl ProjectStore for DiskProjectStore {
    /// An absent or zero-length autosave reads as `None` rather than as an
    /// empty `Project` — empty bytes decode happily into one that carries no
    /// scenes, palettes or patches.
    fn load(&self) -> Result<Option<Project>, String> {
        let project_binary = match std::fs::read(&self.path) {
            Ok(bytes) => bytes,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => {
                return Err(format!(
                    "Failed to read project at {}: {e}",
                    self.path.display()
                ));
            }
        };

        if project_binary.is_empty() {
            return Ok(None);
        }

        Project::decode(project_binary.as_slice())
            .map(Some)
            .map_err(|e| format!("Failed to decode project: {e}"))
    }

    fn queue_write(&self, project: &Project) {
        let mut pending = self.lock_pending();
        pending.project_binary = Some(project.encode_to_vec());

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

    /// Writes immediately, dropping any queued write in favour of `project`.
    fn flush_sync(&self, project: &Project) {
        let mut pending = self.lock_pending();

        if let Some(handle) = pending.debounce.take() {
            handle.abort();
        }
        pending.project_binary = None;

        write(&self.path, &project.encode_to_vec());
    }
}
