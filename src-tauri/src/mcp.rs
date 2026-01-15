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
use std::net::SocketAddr;
use tauri::AppHandle;
use tokio::net::TcpListener;

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

#[derive(Serialize)]
pub struct TilesResponse {
    pub scene_name: String,
    pub scene_id: u64,
    pub tiles: Vec<TileInfo>,
}

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
}

#[derive(Serialize)]
pub struct TileResponse {
    pub success: bool,
    pub tile: TileInfo,
}

#[derive(Deserialize)]
pub struct SetAmountRequest {
    pub amount: f32,
}

#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

/// Get current state of a tile (enabled/disabled and strength)
fn get_tile_state(tile: &dmx_engine::proto::scene::Tile) -> (bool, f32) {
    match &tile.transition {
        Some(Transition::StartFadeInMs(_)) => {
            // Tile is fading in or fully on
            (true, 1.0)
        }
        Some(Transition::StartFadeOutMs(_)) => {
            // Tile is fading out or off
            (false, 0.0)
        }
        Some(Transition::AbsoluteStrength(strength)) => {
            // Tile has explicit strength set
            (*strength > 0.1, *strength)
        }
        None => (false, 0.0),
    }
}

/// Enable a tile by setting it to fade in
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

    // Get current time in milliseconds
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("System time error: {}", e))?
        .as_millis() as u64;

    // Set tile to fade in (or restart if it's a one-shot)
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

/// Disable a tile by setting it to fade out
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

    // Get current time in milliseconds
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("System time error: {}", e))?
        .as_millis() as u64;

    // Set tile to fade out
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

/// Set tile amount (absolute strength)
fn set_tile_amount(scene: &mut Scene, tile_id: u64, amount: f32) -> Result<TileInfo, String> {
    if amount < 0.0 || amount > 1.0 {
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

    // Set absolute strength
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

// HTTP Response helpers
fn json_response<T: Serialize>(status: StatusCode, body: &T) -> Response<Full<Bytes>> {
    let json = serde_json::to_string(body).unwrap_or_else(|_| "{}".to_string());
    Response::builder()
        .status(status)
        .header("Content-Type", "application/json")
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        .header("Access-Control-Allow-Headers", "Content-Type")
        .body(Full::new(Bytes::from(json)))
        .unwrap()
}

fn error_response(status: StatusCode, message: &str) -> Response<Full<Bytes>> {
    json_response(status, &ErrorResponse {
        error: message.to_string(),
    })
}

// Request handler
async fn handle_request(req: Request<Incoming>) -> Result<Response<Full<Bytes>>, hyper::Error> {
    // Handle CORS preflight
    if req.method() == Method::OPTIONS {
        return Ok(Response::builder()
            .status(StatusCode::OK)
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            .header("Access-Control-Allow-Headers", "Content-Type")
            .body(Full::new(Bytes::new()))
            .unwrap());
    }

    let path = req.uri().path();
    let method = req.method();

    // Route matching
    match (method, path) {
        (&Method::GET, "/health") => {
            let response = HealthResponse {
                status: "ok".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            };
            Ok(json_response(StatusCode::OK, &response))
        }

        (&Method::GET, "/tiles") => {
            let project = match PROJECT_REF.lock() {
                Ok(p) => p,
                Err(e) => {
                    return Ok(error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        &format!("Failed to lock project: {}", e),
                    ))
                }
            };

            let scene = match project.scenes.get(&project.active_scene) {
                Some(s) => s,
                None => {
                    return Ok(error_response(
                        StatusCode::NOT_FOUND,
                        "Active scene not found",
                    ))
                }
            };

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

            let response = TilesResponse {
                scene_name: scene.name.clone(),
                scene_id: project.active_scene,
                tiles,
            };

            Ok(json_response(StatusCode::OK, &response))
        }

        (&Method::POST, path) if path.starts_with("/tiles/") => {
            // Parse tile ID from path
            let parts: Vec<&str> = path.split('/').collect();
            if parts.len() < 3 {
                return Ok(error_response(StatusCode::BAD_REQUEST, "Invalid path"));
            }

            let tile_id: u64 = match parts[2].parse() {
                Ok(id) => id,
                Err(_) => return Ok(error_response(StatusCode::BAD_REQUEST, "Invalid tile ID")),
            };

            let action = parts.get(3).copied();

            match action {
                Some("enable") => {
                    let mut project = match PROJECT_REF.lock() {
                        Ok(p) => p,
                        Err(e) => {
                            return Ok(error_response(
                                StatusCode::INTERNAL_SERVER_ERROR,
                                &format!("Failed to lock project: {}", e),
                            ))
                        }
                    };

                    let scene = match project.scenes.get_mut(&project.active_scene) {
                        Some(s) => s,
                        None => {
                            return Ok(error_response(
                                StatusCode::NOT_FOUND,
                                "Active scene not found",
                            ))
                        }
                    };

                    match enable_tile(scene, tile_id) {
                        Ok(tile_info) => Ok(json_response(
                            StatusCode::OK,
                            &TileResponse {
                                success: true,
                                tile: tile_info,
                            },
                        )),
                        Err(e) => Ok(error_response(StatusCode::NOT_FOUND, &e)),
                    }
                }

                Some("disable") => {
                    let mut project = match PROJECT_REF.lock() {
                        Ok(p) => p,
                        Err(e) => {
                            return Ok(error_response(
                                StatusCode::INTERNAL_SERVER_ERROR,
                                &format!("Failed to lock project: {}", e),
                            ))
                        }
                    };

                    let scene = match project.scenes.get_mut(&project.active_scene) {
                        Some(s) => s,
                        None => {
                            return Ok(error_response(
                                StatusCode::NOT_FOUND,
                                "Active scene not found",
                            ))
                        }
                    };

                    match disable_tile(scene, tile_id) {
                        Ok(tile_info) => Ok(json_response(
                            StatusCode::OK,
                            &TileResponse {
                                success: true,
                                tile: tile_info,
                            },
                        )),
                        Err(e) => Ok(error_response(StatusCode::NOT_FOUND, &e)),
                    }
                }

                Some("amount") => {
                    // Read request body
                    let body = req.collect().await?.to_bytes();
                    let set_amount: SetAmountRequest = match serde_json::from_slice(&body) {
                        Ok(req) => req,
                        Err(_) => {
                            return Ok(error_response(
                                StatusCode::BAD_REQUEST,
                                "Invalid JSON body",
                            ))
                        }
                    };

                    let mut project = match PROJECT_REF.lock() {
                        Ok(p) => p,
                        Err(e) => {
                            return Ok(error_response(
                                StatusCode::INTERNAL_SERVER_ERROR,
                                &format!("Failed to lock project: {}", e),
                            ))
                        }
                    };

                    let scene = match project.scenes.get_mut(&project.active_scene) {
                        Some(s) => s,
                        None => {
                            return Ok(error_response(
                                StatusCode::NOT_FOUND,
                                "Active scene not found",
                            ))
                        }
                    };

                    match set_tile_amount(scene, tile_id, set_amount.amount) {
                        Ok(tile_info) => Ok(json_response(
                            StatusCode::OK,
                            &TileResponse {
                                success: true,
                                tile: tile_info,
                            },
                        )),
                        Err(e) => Ok(error_response(StatusCode::BAD_REQUEST, &e)),
                    }
                }

                _ => Ok(error_response(StatusCode::NOT_FOUND, "Endpoint not found")),
            }
        }

        _ => Ok(error_response(StatusCode::NOT_FOUND, "Endpoint not found")),
    }
}

pub async fn start_mcp_server(_app_handle: AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let addr = SocketAddr::from(([127, 0, 0, 1], 3001));
    let listener = TcpListener::bind(addr).await?;

    println!("DMX MCP Server listening on http://{}", addr);
    println!("Available endpoints:");
    println!("  GET  /health - Health check");
    println!("  GET  /tiles - List all tiles in active scene");
    println!("  POST /tiles/:id/enable - Enable a tile");
    println!("  POST /tiles/:id/disable - Disable a tile");
    println!("  POST /tiles/:id/amount - Set tile amount (body: {{ \"amount\": 0.0-1.0 }})");

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
