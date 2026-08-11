use dmx_engine::project;
use dmx_engine::proto::Project;
use rmcp::ErrorData;
use rmcp::model::{CallToolResult, ContentBlock};
use serde_json::Value;
use tauri::AppHandle;

use crate::project::save_project_internal;

/// Serialize any JSON value into a pretty-printed text [`CallToolResult`]. The
/// standard success shape for every tool's response.
pub fn json_result(value: &Value) -> Result<CallToolResult, ErrorData> {
    let text = serde_json::to_string_pretty(value)
        .map_err(|e| ErrorData::internal_error(e.to_string(), None))?;
    Ok(CallToolResult::success(vec![ContentBlock::text(text)]))
}

/// The agentic save: atomically apply `f` to the current project and run the
/// same finalize pipeline the UI uses (emit → debounced persist → rebuild
/// outputs).
///
/// Call this once per state-modifying tool: do all of the tool's mutation inside
/// the single closure, so each tool invocation is one atomic, undoable operation
/// rather than several. Never chain multiple `ai_save` calls within one tool.
pub async fn ai_save<F>(app: &AppHandle, description: &str, f: F) -> Result<(), ErrorData>
where
    F: FnOnce(&mut Project) -> Result<(), String>,
{
    let description = format!("AI: {description}");

    // Closure errors are surfaced as invalid_params: in practice they represent
    // a bad request (missing id, failed consistency check) the agent can act on.
    project::save(&description, true, f).map_err(|e| ErrorData::invalid_params(e, None))?;

    save_project_internal(app)
        .await
        .map_err(|e| ErrorData::internal_error(e, None))
}
