use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use dmx_engine::project::PROJECT_REF;
use dmx_engine::proto::scene::tile::Transition;
use dmx_engine::proto::Scene;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::sync::Mutex;
use tower_http::cors::CorsLayer;

#[derive(Clone)]
pub struct McpState {
    pub app_handle: AppHandle,
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

// Route Handlers

async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

async fn get_tiles(State(_state): State<Arc<Mutex<McpState>>>) -> impl IntoResponse {
    let project = match PROJECT_REF.lock() {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Failed to lock project: {}", e),
                }),
            )
                .into_response()
        }
    };

    let scene = match project.scenes.get(&project.active_scene) {
        Some(s) => s,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Active scene not found".to_string(),
                }),
            )
                .into_response()
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

    (
        StatusCode::OK,
        Json(TilesResponse {
            scene_name: scene.name.clone(),
            scene_id: project.active_scene,
            tiles,
        }),
    )
        .into_response()
}

async fn enable_tile_handler(
    State(_state): State<Arc<Mutex<McpState>>>,
    Path(tile_id): Path<String>,
) -> impl IntoResponse {
    let tile_id: u64 = match tile_id.parse() {
        Ok(id) => id,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "Invalid tile ID".to_string(),
                }),
            )
                .into_response()
        }
    };

    let mut project = match PROJECT_REF.lock() {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Failed to lock project: {}", e),
                }),
            )
                .into_response()
        }
    };

    let scene = match project.scenes.get_mut(&project.active_scene) {
        Some(s) => s,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Active scene not found".to_string(),
                }),
            )
                .into_response()
        }
    };

    match enable_tile(scene, tile_id) {
        Ok(tile_info) => (StatusCode::OK, Json(TileResponse {
            success: true,
            tile: tile_info,
        }))
            .into_response(),
        Err(e) => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse { error: e }),
        )
            .into_response(),
    }
}

async fn disable_tile_handler(
    State(_state): State<Arc<Mutex<McpState>>>,
    Path(tile_id): Path<String>,
) -> impl IntoResponse {
    let tile_id: u64 = match tile_id.parse() {
        Ok(id) => id,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "Invalid tile ID".to_string(),
                }),
            )
                .into_response()
        }
    };

    let mut project = match PROJECT_REF.lock() {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Failed to lock project: {}", e),
                }),
            )
                .into_response()
        }
    };

    let scene = match project.scenes.get_mut(&project.active_scene) {
        Some(s) => s,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Active scene not found".to_string(),
                }),
            )
                .into_response()
        }
    };

    match disable_tile(scene, tile_id) {
        Ok(tile_info) => (StatusCode::OK, Json(TileResponse {
            success: true,
            tile: tile_info,
        }))
            .into_response(),
        Err(e) => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse { error: e }),
        )
            .into_response(),
    }
}

async fn set_tile_amount_handler(
    State(_state): State<Arc<Mutex<McpState>>>,
    Path(tile_id): Path<String>,
    Json(payload): Json<SetAmountRequest>,
) -> impl IntoResponse {
    let tile_id: u64 = match tile_id.parse() {
        Ok(id) => id,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "Invalid tile ID".to_string(),
                }),
            )
                .into_response()
        }
    };

    let mut project = match PROJECT_REF.lock() {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("Failed to lock project: {}", e),
                }),
            )
                .into_response()
        }
    };

    let scene = match project.scenes.get_mut(&project.active_scene) {
        Some(s) => s,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Active scene not found".to_string(),
                }),
            )
                .into_response()
        }
    };

    match set_tile_amount(scene, tile_id, payload.amount) {
        Ok(tile_info) => (StatusCode::OK, Json(TileResponse {
            success: true,
            tile: tile_info,
        }))
            .into_response(),
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: e }),
        )
            .into_response(),
    }
}

pub fn create_router(app_handle: AppHandle) -> Router {
    let state = Arc::new(Mutex::new(McpState { app_handle }));

    Router::new()
        .route("/health", get(health_check))
        .route("/tiles", get(get_tiles))
        .route("/tiles/:id/enable", post(enable_tile_handler))
        .route("/tiles/:id/disable", post(disable_tile_handler))
        .route("/tiles/:id/amount", post(set_tile_amount_handler))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

pub async fn start_mcp_server(app_handle: AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let app = create_router(app_handle);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3001));
    let listener = tokio::net::TcpListener::bind(addr).await?;

    println!("DMX MCP Server listening on http://{}", addr);
    println!("Available endpoints:");
    println!("  GET  /health - Health check");
    println!("  GET  /tiles - List all tiles in active scene");
    println!("  POST /tiles/:id/enable - Enable a tile");
    println!("  POST /tiles/:id/disable - Disable a tile");
    println!("  POST /tiles/:id/amount - Set tile amount (body: {{ \"amount\": 0.0-1.0 }})");

    axum::serve(listener, app).await?;

    Ok(())
}
