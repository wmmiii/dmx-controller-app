use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use rmcp::ErrorData;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

/// Requests awaiting a response from the frontend webview, keyed by request id.
static PENDING: LazyLock<Mutex<HashMap<u64, oneshot::Sender<Value>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

/// Event the webview listens on to compile a shader in its real WebGL2 pipeline
/// (`src/system_interfaces/visualizer.ts`).
const REQUEST_EVENT: &str = "compile-visualizer";

/// How long a tool waits for the webview before giving up — the app may be
/// closed or backgrounded, in which case the agent should get an error rather
/// than block forever.
const TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone, serde::Serialize)]
struct CompileVisualizerRequest {
    id: u64,
    glsl_source: String,
}

pub async fn compile_visualizer(app: &AppHandle, glsl_source: &str) -> Result<Value, ErrorData> {
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = oneshot::channel();
    pending().insert(id, tx);

    let request = CompileVisualizerRequest {
        id,
        glsl_source: glsl_source.to_string(),
    };
    if let Err(e) = app.emit(REQUEST_EVENT, request) {
        pending().remove(&id);
        return Err(ErrorData::internal_error(
            format!("Failed to reach the app window: {e}"),
            None,
        ));
    }

    match tokio::time::timeout(TIMEOUT, rx).await {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(_)) => Err(ErrorData::internal_error(
            "The app window dropped the request",
            None,
        )),
        Err(_) => {
            pending().remove(&id);
            Err(ErrorData::internal_error(
                "Timed out waiting for the app window to respond. Is the DMX Controller app open?",
                None,
            ))
        }
    }
}

fn pending() -> std::sync::MutexGuard<'static, HashMap<u64, oneshot::Sender<Value>>> {
    PENDING
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// Webview delivers a response for a pending [`request`].
#[tauri::command]
pub fn mcp_frontend_response(id: u64, response: Value) {
    if let Some(tx) = pending().remove(&id) {
        let _ = tx.send(response);
    }
}
