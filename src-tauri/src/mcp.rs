use dmx_engine::project::PROJECT_REF;
use dmx_engine::proto::scene::{tile::Transition, TileMap};
use dmx_engine::proto::Scene;
use jsonrpsee::core::RpcResult;
use jsonrpsee::server::{Server, ServerHandle};
use jsonrpsee::types::ErrorObjectOwned;
use jsonrpsee::RpcModule;
use prost::Message;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

// Helper to serialize protobuf TileMap to JSON
fn tilemap_to_json(tile_map: &TileMap) -> Value {
    // Serialize protobuf to JSON via binary encoding
    let bytes = tile_map.encode_to_vec();
    // For JSON output, we'll create a simplified representation
    json!({
        "id": tile_map.id.to_string(),
        "name": tile_map.tile.as_ref().map(|t| t.name.clone()).unwrap_or_default(),
        "x": tile_map.x,
        "y": tile_map.y,
        "priority": tile_map.priority,
        "tile": tile_map.tile.as_ref().map(|t| {
            json!({
                "name": t.name,
                "transition": match &t.transition {
                    Some(Transition::StartFadeInMs(ms)) => json!({"start_fade_in_ms": ms}),
                    Some(Transition::StartFadeOutMs(ms)) => json!({"start_fade_out_ms": ms}),
                    Some(Transition::AbsoluteStrength(s)) => json!({"absolute_strength": s}),
                    None => json!(null),
                }
            })
        })
    })
}

fn list_tiles_impl() -> Result<Vec<Value>, String> {
    let project = PROJECT_REF
        .lock()
        .map_err(|e| format!("Failed to lock project: {}", e))?;

    let scene = project
        .scenes
        .get(&project.active_scene)
        .ok_or_else(|| "Active scene not found".to_string())?;

    let tiles: Vec<Value> = scene
        .tile_map
        .iter()
        .map(tilemap_to_json)
        .collect();

    Ok(tiles)
}

fn enable_tile_impl(scene: &mut Scene, tile_id: u64) -> Result<Value, String> {
    let tile_map = scene
        .tile_map
        .iter_mut()
        .find(|tm| tm.id == tile_id)
        .ok_or_else(|| format!("Tile with id {} not found", tile_id))?;

    let tile = tile_map
        .tile
        .as_mut()
        .ok_or_else(|| "Tile data missing".to_string())?;

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("System time error: {}", e))?
        .as_millis() as u64;

    tile.transition = Some(Transition::StartFadeInMs(now_ms));

    Ok(tilemap_to_json(tile_map))
}

fn disable_tile_impl(scene: &mut Scene, tile_id: u64) -> Result<Value, String> {
    let tile_map = scene
        .tile_map
        .iter_mut()
        .find(|tm| tm.id == tile_id)
        .ok_or_else(|| format!("Tile with id {} not found", tile_id))?;

    let tile = tile_map
        .tile
        .as_mut()
        .ok_or_else(|| "Tile data missing".to_string())?;

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("System time error: {}", e))?
        .as_millis() as u64;

    tile.transition = Some(Transition::StartFadeOutMs(now_ms));

    Ok(tilemap_to_json(tile_map))
}

fn set_tile_amount_impl(scene: &mut Scene, tile_id: u64, amount: f32) -> Result<Value, String> {
    if !(0.0..=1.0).contains(&amount) {
        return Err("Amount must be between 0.0 and 1.0".to_string());
    }

    let tile_map = scene
        .tile_map
        .iter_mut()
        .find(|tm| tm.id == tile_id)
        .ok_or_else(|| format!("Tile with id {} not found", tile_id))?;

    let tile = tile_map
        .tile
        .as_mut()
        .ok_or_else(|| "Tile data missing".to_string())?;

    tile.transition = Some(Transition::AbsoluteStrength(amount));

    Ok(tilemap_to_json(tile_map))
}

// Convert String error to JSON-RPC error
fn to_rpc_error(msg: String) -> ErrorObjectOwned {
    ErrorObjectOwned::owned(-32000, msg, None::<()>)
}

pub async fn start_mcp_server(_app_handle: AppHandle) -> Result<ServerHandle, Box<dyn std::error::Error>> {
    let server = Server::builder()
        .build("127.0.0.1:3001")
        .await?;

    let mut module = RpcModule::new(());

    // MCP initialize method
    module.register_method("initialize", |_, _, _| {
        Ok(json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": {
                    "listChanged": false
                }
            },
            "serverInfo": {
                "name": "dmx-controller-mcp",
                "version": env!("CARGO_PKG_VERSION")
            }
        }))
    })?;

    // MCP tools/list method
    module.register_method("tools/list", |_, _, _| {
        Ok(json!({
            "tools": [
                {
                    "name": "list_tiles",
                    "description": "List all tiles in the currently active scene with their state (enabled/disabled, position, strength)",
                    "inputSchema": {
                        "type": "object",
                        "properties": {},
                        "required": []
                    }
                },
                {
                    "name": "enable_tile",
                    "description": "Enable a tile by starting its fade-in transition. For one-shot tiles, this restarts them from the beginning.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "tile_id": {
                                "type": "string",
                                "description": "The ID of the tile to enable"
                            }
                        },
                        "required": ["tile_id"]
                    }
                },
                {
                    "name": "disable_tile",
                    "description": "Disable a tile by starting its fade-out transition.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "tile_id": {
                                "type": "string",
                                "description": "The ID of the tile to disable"
                            }
                        },
                        "required": ["tile_id"]
                    }
                },
                {
                    "name": "set_tile_amount",
                    "description": "Set the absolute strength/amount of a tile (0.0 to 1.0), bypassing normal fade transitions. Useful for manual dimming or custom fade patterns.",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "tile_id": {
                                "type": "string",
                                "description": "The ID of the tile to control"
                            },
                            "amount": {
                                "type": "number",
                                "description": "The strength/amount from 0.0 (off) to 1.0 (full)",
                                "minimum": 0.0,
                                "maximum": 1.0
                            }
                        },
                        "required": ["tile_id", "amount"]
                    }
                }
            ]
        }))
    })?;

    // MCP tools/call method
    module.register_method("tools/call", |params, _, _| {
        #[derive(Deserialize)]
        struct ToolCallParams {
            name: String,
            arguments: Option<Value>,
        }

        let tool_params: ToolCallParams = params.parse()?;

        let result: RpcResult<Value> = match tool_params.name.as_str() {
            "list_tiles" => {
                let tiles = list_tiles_impl().map_err(to_rpc_error)?;
                let tiles_json = serde_json::to_string_pretty(&tiles)
                    .unwrap_or_else(|_| "[]".to_string());
                Ok(json!({
                    "content": [{
                        "type": "text",
                        "text": format!("Active scene tiles:\n{}", tiles_json)
                    }]
                }))
            }
            "enable_tile" => {
                let tile_id = tool_params
                    .arguments
                    .as_ref()
                    .and_then(|v| v.get("tile_id"))
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<u64>().ok())
                    .ok_or_else(|| to_rpc_error("Missing or invalid tile_id parameter".to_string()))?;

                let mut project = PROJECT_REF
                    .lock()
                    .map_err(|e| to_rpc_error(format!("Failed to lock project: {}", e)))?;

                let scene = project
                    .scenes
                    .get_mut(&project.active_scene)
                    .ok_or_else(|| to_rpc_error("Active scene not found".to_string()))?;

                let tile_data = enable_tile_impl(scene, tile_id).map_err(to_rpc_error)?;
                let tile_json = serde_json::to_string_pretty(&tile_data).unwrap_or_default();

                Ok(json!({
                    "content": [{
                        "type": "text",
                        "text": format!("Tile enabled successfully:\n{}", tile_json)
                    }]
                }))
            }
            "disable_tile" => {
                let tile_id = tool_params
                    .arguments
                    .as_ref()
                    .and_then(|v| v.get("tile_id"))
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<u64>().ok())
                    .ok_or_else(|| to_rpc_error("Missing or invalid tile_id parameter".to_string()))?;

                let mut project = PROJECT_REF
                    .lock()
                    .map_err(|e| to_rpc_error(format!("Failed to lock project: {}", e)))?;

                let scene = project
                    .scenes
                    .get_mut(&project.active_scene)
                    .ok_or_else(|| to_rpc_error("Active scene not found".to_string()))?;

                let tile_data = disable_tile_impl(scene, tile_id).map_err(to_rpc_error)?;
                let tile_json = serde_json::to_string_pretty(&tile_data).unwrap_or_default();

                Ok(json!({
                    "content": [{
                        "type": "text",
                        "text": format!("Tile disabled successfully:\n{}", tile_json)
                    }]
                }))
            }
            "set_tile_amount" => {
                let args = tool_params
                    .arguments
                    .as_ref()
                    .ok_or_else(|| to_rpc_error("Missing arguments".to_string()))?;

                let tile_id = args
                    .get("tile_id")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<u64>().ok())
                    .ok_or_else(|| to_rpc_error("Missing or invalid tile_id parameter".to_string()))?;

                let amount = args
                    .get("amount")
                    .and_then(|v| v.as_f64())
                    .ok_or_else(|| to_rpc_error("Missing or invalid amount parameter".to_string()))? as f32;

                let mut project = PROJECT_REF
                    .lock()
                    .map_err(|e| to_rpc_error(format!("Failed to lock project: {}", e)))?;

                let scene = project
                    .scenes
                    .get_mut(&project.active_scene)
                    .ok_or_else(|| to_rpc_error("Active scene not found".to_string()))?;

                let tile_data = set_tile_amount_impl(scene, tile_id, amount).map_err(to_rpc_error)?;
                let tile_json = serde_json::to_string_pretty(&tile_data).unwrap_or_default();

                Ok(json!({
                    "content": [{
                        "type": "text",
                        "text": format!("Tile amount set successfully:\n{}", tile_json)
                    }]
                }))
            }
            _ => Err(to_rpc_error(format!("Unknown tool: {}", tool_params.name))),
        };

        result
    })?;

    let addr = server.local_addr()?;
    let handle = server.start(module);

    Ok(handle)
}
