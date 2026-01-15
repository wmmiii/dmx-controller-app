use dmx_engine::project::PROJECT_REF;
use dmx_engine::proto::scene::tile::Transition;
use dmx_engine::proto::Scene;
use http_body_util::{BodyExt, Full};
use hyper::body::{Bytes, Incoming};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::net::SocketAddr;
use tauri::AppHandle;
use tokio::net::TcpListener;

// JSON-RPC 2.0 structures
#[derive(Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    method: String,
    #[serde(default)]
    params: Option<Value>,
    id: Option<Value>,
}

#[derive(Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
    id: Value,
}

#[derive(Serialize)]
struct JsonRpcError {
    code: i32,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
}

// MCP-specific structures
#[derive(Serialize)]
struct ServerInfo {
    name: String,
    version: String,
}

#[derive(Serialize)]
struct ServerCapabilities {
    tools: ToolsCapability,
}

#[derive(Serialize)]
struct ToolsCapability {
    #[serde(rename = "listChanged")]
    list_changed: bool,
}

#[derive(Serialize)]
struct InitializeResult {
    #[serde(rename = "protocolVersion")]
    protocol_version: String,
    capabilities: ServerCapabilities,
    #[serde(rename = "serverInfo")]
    server_info: ServerInfo,
}

#[derive(Serialize)]
struct Tool {
    name: String,
    description: String,
    #[serde(rename = "inputSchema")]
    input_schema: Value,
}

#[derive(Serialize)]
struct ToolsListResult {
    tools: Vec<Tool>,
}

#[derive(Deserialize)]
struct ToolCallParams {
    name: String,
    arguments: Option<Value>,
}

#[derive(Serialize)]
struct ToolCallResult {
    content: Vec<ToolContent>,
    #[serde(rename = "isError", skip_serializing_if = "Option::is_none")]
    is_error: Option<bool>,
}

#[derive(Serialize)]
struct ToolContent {
    #[serde(rename = "type")]
    content_type: String,
    text: String,
}

#[derive(Serialize, Deserialize)]
pub struct TileInfo {
    pub id: String,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub priority: i32,
    pub enabled: bool,
    pub amount: f32,
}

// Tile management functions
fn get_tile_state(tile: &dmx_engine::proto::scene::Tile) -> (bool, f32) {
    match &tile.transition {
        Some(Transition::StartFadeInMs(_)) => (true, 1.0),
        Some(Transition::StartFadeOutMs(_)) => (false, 0.0),
        Some(Transition::AbsoluteStrength(strength)) => (*strength > 0.1, *strength),
        None => (false, 0.0),
    }
}

fn list_tiles() -> Result<Vec<TileInfo>, String> {
    let project = PROJECT_REF
        .lock()
        .map_err(|e| format!("Failed to lock project: {}", e))?;

    let scene = project
        .scenes
        .get(&project.active_scene)
        .ok_or_else(|| "Active scene not found".to_string())?;

    let tiles: Vec<TileInfo> = scene
        .tile_map
        .iter()
        .filter_map(|tile_map| {
            let tile = tile_map.tile.as_ref()?;
            let (enabled, amount) = get_tile_state(tile);
            Some(TileInfo {
                id: tile_map.id.to_string(),
                name: tile.name.clone(),
                x: tile_map.x,
                y: tile_map.y,
                priority: tile_map.priority,
                enabled,
                amount,
            })
        })
        .collect();

    Ok(tiles)
}

fn enable_tile(scene: &mut Scene, tile_id: u64) -> Result<TileInfo, String> {
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

    let (enabled, amount) = get_tile_state(tile);

    Ok(TileInfo {
        id: tile_id.to_string(),
        name: tile.name.clone(),
        x: tile_map.x,
        y: tile_map.y,
        priority: tile_map.priority,
        enabled,
        amount,
    })
}

fn disable_tile(scene: &mut Scene, tile_id: u64) -> Result<TileInfo, String> {
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

    let (enabled, amount) = get_tile_state(tile);

    Ok(TileInfo {
        id: tile_id.to_string(),
        name: tile.name.clone(),
        x: tile_map.x,
        y: tile_map.y,
        priority: tile_map.priority,
        enabled,
        amount,
    })
}

fn set_tile_amount(scene: &mut Scene, tile_id: u64, amount: f32) -> Result<TileInfo, String> {
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

    let (enabled, amount) = get_tile_state(tile);

    Ok(TileInfo {
        id: tile_id.to_string(),
        name: tile.name.clone(),
        x: tile_map.x,
        y: tile_map.y,
        priority: tile_map.priority,
        enabled,
        amount,
    })
}

// MCP method handlers
fn handle_initialize() -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        result: Some(json!(InitializeResult {
            protocol_version: "2024-11-05".to_string(),
            capabilities: ServerCapabilities {
                tools: ToolsCapability {
                    list_changed: false,
                },
            },
            server_info: ServerInfo {
                name: "dmx-controller-mcp".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            },
        })),
        error: None,
        id: Value::Null,
    }
}

fn handle_tools_list() -> JsonRpcResponse {
    let tools = vec![
        Tool {
            name: "list_tiles".to_string(),
            description: "List all tiles in the currently active scene with their state (enabled/disabled, position, strength)".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
        Tool {
            name: "enable_tile".to_string(),
            description: "Enable a tile by starting its fade-in transition. For one-shot tiles, this restarts them from the beginning.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "tile_id": {
                        "type": "string",
                        "description": "The ID of the tile to enable"
                    }
                },
                "required": ["tile_id"]
            }),
        },
        Tool {
            name: "disable_tile".to_string(),
            description: "Disable a tile by starting its fade-out transition.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "tile_id": {
                        "type": "string",
                        "description": "The ID of the tile to disable"
                    }
                },
                "required": ["tile_id"]
            }),
        },
        Tool {
            name: "set_tile_amount".to_string(),
            description: "Set the absolute strength/amount of a tile (0.0 to 1.0), bypassing normal fade transitions. Useful for manual dimming or custom fade patterns.".to_string(),
            input_schema: json!({
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
            }),
        },
    ];

    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        result: Some(json!(ToolsListResult { tools })),
        error: None,
        id: Value::Null,
    }
}

fn handle_tools_call(params: ToolCallParams) -> JsonRpcResponse {
    let result = match params.name.as_str() {
        "list_tiles" => {
            match list_tiles() {
                Ok(tiles) => {
                    let tiles_json = serde_json::to_string_pretty(&tiles).unwrap_or_else(|_| "[]".to_string());
                    Ok(ToolCallResult {
                        content: vec![ToolContent {
                            content_type: "text".to_string(),
                            text: format!("Active scene tiles:\n{}", tiles_json),
                        }],
                        is_error: None,
                    })
                }
                Err(e) => Err(e),
            }
        }
        "enable_tile" => {
            let tile_id = params
                .arguments
                .as_ref()
                .and_then(|v| v.get("tile_id"))
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse::<u64>().ok())
                .ok_or_else(|| "Missing or invalid tile_id parameter".to_string())?;

            let mut project = PROJECT_REF
                .lock()
                .map_err(|e| format!("Failed to lock project: {}", e))?;

            let scene = project
                .scenes
                .get_mut(&project.active_scene)
                .ok_or_else(|| "Active scene not found".to_string())?;

            match enable_tile(scene, tile_id) {
                Ok(tile_info) => {
                    let tile_json = serde_json::to_string_pretty(&tile_info).unwrap_or_default();
                    Ok(ToolCallResult {
                        content: vec![ToolContent {
                            content_type: "text".to_string(),
                            text: format!("Tile enabled successfully:\n{}", tile_json),
                        }],
                        is_error: None,
                    })
                }
                Err(e) => Err(e),
            }
        }
        "disable_tile" => {
            let tile_id = params
                .arguments
                .as_ref()
                .and_then(|v| v.get("tile_id"))
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse::<u64>().ok())
                .ok_or_else(|| "Missing or invalid tile_id parameter".to_string())?;

            let mut project = PROJECT_REF
                .lock()
                .map_err(|e| format!("Failed to lock project: {}", e))?;

            let scene = project
                .scenes
                .get_mut(&project.active_scene)
                .ok_or_else(|| "Active scene not found".to_string())?;

            match disable_tile(scene, tile_id) {
                Ok(tile_info) => {
                    let tile_json = serde_json::to_string_pretty(&tile_info).unwrap_or_default();
                    Ok(ToolCallResult {
                        content: vec![ToolContent {
                            content_type: "text".to_string(),
                            text: format!("Tile disabled successfully:\n{}", tile_json),
                        }],
                        is_error: None,
                    })
                }
                Err(e) => Err(e),
            }
        }
        "set_tile_amount" => {
            let args = params
                .arguments
                .as_ref()
                .ok_or_else(|| "Missing arguments".to_string())?;

            let tile_id = args
                .get("tile_id")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse::<u64>().ok())
                .ok_or_else(|| "Missing or invalid tile_id parameter".to_string())?;

            let amount = args
                .get("amount")
                .and_then(|v| v.as_f64())
                .ok_or_else(|| "Missing or invalid amount parameter".to_string())? as f32;

            let mut project = PROJECT_REF
                .lock()
                .map_err(|e| format!("Failed to lock project: {}", e))?;

            let scene = project
                .scenes
                .get_mut(&project.active_scene)
                .ok_or_else(|| "Active scene not found".to_string())?;

            match set_tile_amount(scene, tile_id, amount) {
                Ok(tile_info) => {
                    let tile_json = serde_json::to_string_pretty(&tile_info).unwrap_or_default();
                    Ok(ToolCallResult {
                        content: vec![ToolContent {
                            content_type: "text".to_string(),
                            text: format!("Tile amount set successfully:\n{}", tile_json),
                        }],
                        is_error: None,
                    })
                }
                Err(e) => Err(e),
            }
        }
        _ => Err(format!("Unknown tool: {}", params.name)),
    };

    match result {
        Ok(tool_result) => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            result: Some(json!(tool_result)),
            error: None,
            id: Value::Null,
        },
        Err(error_msg) => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            result: None,
            error: Some(JsonRpcError {
                code: -32000,
                message: error_msg,
                data: None,
            }),
            id: Value::Null,
        },
    }
}

fn json_response(status: StatusCode, body: &impl Serialize) -> Response<Full<Bytes>> {
    let json = serde_json::to_string(body).unwrap_or_else(|_| "{}".to_string());
    Response::builder()
        .status(status)
        .header("Content-Type", "application/json")
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Methods", "POST, OPTIONS")
        .header("Access-Control-Allow-Headers", "Content-Type")
        .body(Full::new(Bytes::from(json)))
        .unwrap()
}

async fn handle_request(req: Request<Incoming>) -> Result<Response<Full<Bytes>>, hyper::Error> {
    // Handle CORS preflight
    if req.method() == Method::OPTIONS {
        return Ok(Response::builder()
            .status(StatusCode::OK)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "POST, OPTIONS")
            .header("Access-Control-Allow-Headers", "Content-Type")
            .body(Full::new(Bytes::new()))
            .unwrap());
    }

    if req.method() != Method::POST {
        let error = JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            result: None,
            error: Some(JsonRpcError {
                code: -32600,
                message: "Only POST requests are supported".to_string(),
                data: None,
            }),
            id: Value::Null,
        };
        return Ok(json_response(StatusCode::METHOD_NOT_ALLOWED, &error));
    }

    // Read request body
    let body = req.collect().await?.to_bytes();
    let rpc_request: JsonRpcRequest = match serde_json::from_slice(&body) {
        Ok(req) => req,
        Err(_) => {
            let error = JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                result: None,
                error: Some(JsonRpcError {
                    code: -32700,
                    message: "Parse error".to_string(),
                    data: None,
                }),
                id: Value::Null,
            };
            return Ok(json_response(StatusCode::BAD_REQUEST, &error));
        }
    };

    // Handle JSON-RPC method
    let mut response = match rpc_request.method.as_str() {
        "initialize" => handle_initialize(),
        "tools/list" => handle_tools_list(),
        "tools/call" => {
            match rpc_request.params {
                Some(params) => {
                    match serde_json::from_value::<ToolCallParams>(params) {
                        Ok(tool_params) => handle_tools_call(tool_params),
                        Err(_) => JsonRpcResponse {
                            jsonrpc: "2.0".to_string(),
                            result: None,
                            error: Some(JsonRpcError {
                                code: -32602,
                                message: "Invalid params".to_string(),
                                data: None,
                            }),
                            id: Value::Null,
                        },
                    }
                }
                None => JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    result: None,
                    error: Some(JsonRpcError {
                        code: -32602,
                        message: "Missing params".to_string(),
                        data: None,
                    }),
                    id: Value::Null,
                },
            }
        }
        _ => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            result: None,
            error: Some(JsonRpcError {
                code: -32601,
                message: format!("Method not found: {}", rpc_request.method),
                data: None,
            }),
            id: Value::Null,
        },
    };

    // Set the request ID in the response
    response.id = rpc_request.id.unwrap_or(Value::Null);

    Ok(json_response(StatusCode::OK, &response))
}

pub async fn start_mcp_server(_app_handle: AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let addr = SocketAddr::from(([127, 0, 0, 1], 3001));
    let listener = TcpListener::bind(addr).await?;

    println!("DMX MCP Server listening on http://{}", addr);
    println!("Protocol: JSON-RPC 2.0 over HTTP");
    println!("MCP Protocol Version: 2024-11-05");
    println!("\nAvailable methods:");
    println!("  initialize - Initialize MCP connection and get server capabilities");
    println!("  tools/list - List all available tools");
    println!("  tools/call - Execute a tool");
    println!("\nAvailable tools:");
    println!("  list_tiles - List all tiles in active scene");
    println!("  enable_tile - Enable a tile");
    println!("  disable_tile - Disable a tile");
    println!("  set_tile_amount - Set tile strength (0.0-1.0)");

    loop {
        let (stream, _) = listener.accept().await?;
        let io = TokioIo::new(stream);

        tokio::spawn(async move {
            if let Err(err) = http1::Builder::new()
                .serve_connection(io, service_fn(handle_request))
                .await
            {
                eprintln!("Error serving connection: {:?}", err);
            }
        });
    }
}
