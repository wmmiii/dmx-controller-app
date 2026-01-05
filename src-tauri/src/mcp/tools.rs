// MCP tool implementations
//
// These functions implement the actual logic for each MCP tool that the AI can call.

use dmx_engine::project::PROJECT_REF;
use serde_json::{json, Value};
use tauri::AppHandle;

use super::server::McpError;
use super::types::scene_to_json;

/// Get the current active scene with all tiles
pub async fn get_current_scene(_app: &AppHandle) -> Result<Value, McpError> {
    let project = PROJECT_REF.lock().map_err(|e| McpError {
        code: -32603, // Internal error
        message: format!("Failed to lock project: {}", e),
        data: None,
    })?;

    let active_scene_id = project.active_scene;
    let scene = project.scenes.get(&active_scene_id).ok_or(McpError {
        code: -32603,
        message: format!("Active scene {} not found", active_scene_id),
        data: None,
    })?;

    Ok(json!({
        "scene_id": active_scene_id.to_string(),
        "scene": scene_to_json(scene),
    }))
}

/// List all fixtures and groups in the current patch
pub async fn list_fixtures_and_groups(_app: &AppHandle) -> Result<Value, McpError> {
    let project = PROJECT_REF.lock().map_err(|e| McpError {
        code: -32603,
        message: format!("Failed to lock project: {}", e),
        data: None,
    })?;

    let active_patch_id = project.active_patch;
    let patch = project.patches.get(&active_patch_id).ok_or(McpError {
        code: -32603,
        message: format!("Active patch {} not found", active_patch_id),
        data: None,
    })?;

    // Collect fixtures
    let mut fixtures = Vec::new();
    for (fixture_id, fixture) in &patch.fixtures {
        // Get fixture definition to understand capabilities
        let definition_id = &fixture.definition_id;
        let capabilities = if let Some(def) = project
            .fixture_definitions
            .as_ref()
            .and_then(|defs| defs.definitions.get(definition_id))
        {
            let mut caps = Vec::new();

            // Check for common capabilities
            if def.has_dimmer {
                caps.push("dimmer".to_string());
            }
            if def.has_color {
                caps.push("color".to_string());
            }
            if def.has_pan || def.has_tilt {
                caps.push("movement".to_string());
            }
            if def.has_zoom {
                caps.push("zoom".to_string());
            }
            if def.has_strobe {
                caps.push("strobe".to_string());
            }

            caps
        } else {
            vec![]
        };

        fixtures.push(json!({
            "id": fixture_id.to_string(),
            "name": fixture.name,
            "definition_id": definition_id,
            "address": fixture.address,
            "output_id": fixture.output_id.to_string(),
            "capabilities": capabilities,
        }));
    }

    // Collect groups
    let mut groups = Vec::new();
    for (group_id, group) in &project.groups {
        groups.push(json!({
            "id": group_id.to_string(),
            "name": group.name,
            "fixture_ids": group.fixture_ids.iter().map(|id| id.to_string()).collect::<Vec<_>>(),
            "fixture_count": group.fixture_ids.len(),
        }));
    }

    Ok(json!({
        "patch_id": active_patch_id.to_string(),
        "patch_name": patch.name,
        "fixtures": fixtures,
        "groups": groups,
    }))
}

/// Get example tiles for AI learning
pub async fn get_examples(arguments: &Value) -> Result<Value, McpError> {
    let category = arguments.get("category").and_then(|v| v.as_str());
    let search = arguments.get("search").and_then(|v| v.as_str());

    let examples = if let Some(cat) = category {
        super::examples::get_examples_by_category(cat)
    } else if let Some(query) = search {
        super::examples::search_examples(query)
    } else {
        super::examples::get_examples()
    };

    Ok(json!({
        "examples": examples,
        "count": examples.len(),
    }))
}

// TODO: Implement create_tile tool
// This will require:
// 1. JSON → Protobuf conversion
// 2. Validation (check for tile overlaps, valid fixture/group IDs)
// 3. Updating PROJECT_REF
// 4. Emitting project-update event to frontend

// TODO: Implement modify_tile tool
// Similar to create_tile but updates an existing tile

// TODO: Implement delete_tile tool
// Remove a tile from the scene

// TODO: Implement list_color_palettes tool
// List available color palettes in the scene
