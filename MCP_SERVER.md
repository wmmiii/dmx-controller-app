# DMX Controller MCP HTTP Server

This document describes the HTTP MCP (Model Context Protocol) server implementation for controlling tiles in the DMX controller application.

## Overview

The MCP server is embedded directly in the Rust/Tauri process and provides a REST API for external control of tiles in the currently active scene. The server runs on `http://localhost:3001` and starts automatically when the application launches.

## Architecture

- **Implementation**: Axum web framework in Rust
- **Port**: 3001 (localhost only)
- **State Management**: Direct access to `PROJECT_REF` global state
- **Concurrency**: Thread-safe mutex-protected access
- **CORS**: Enabled (permissive for local development)

## API Endpoints

### GET /health

Health check endpoint to verify the server is running.

**Response:**
```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

### GET /tiles

List all tiles in the currently active scene with their current state.

**Response:**
```json
{
  "scene_name": "Default Scene",
  "scene_id": 12345,
  "tiles": [
    {
      "id": "67890",
      "name": "Red Strobe",
      "x": 0,
      "y": 0,
      "priority": 1,
      "enabled": true,
      "amount": 1.0
    },
    {
      "id": "67891",
      "name": "Blue Pulse",
      "x": 1,
      "y": 0,
      "priority": 0,
      "enabled": false,
      "amount": 0.0
    }
  ]
}
```

**Status Codes:**
- `200 OK` - Success
- `404 Not Found` - Active scene not found
- `500 Internal Server Error` - Failed to access project state

### POST /tiles/:id/enable

Enable a tile by starting its fade-in transition. For one-shot tiles, this restarts them from the beginning. For loop tiles, this begins the fade-in process.

**Path Parameters:**
- `id` - The tile ID (64-bit unsigned integer as string)

**Example:**
```bash
curl -X POST http://localhost:3001/tiles/67890/enable
```

**Response:**
```json
{
  "success": true,
  "tile": {
    "id": "67890",
    "name": "Red Strobe",
    "x": 0,
    "y": 0,
    "priority": 1,
    "enabled": true,
    "amount": 1.0
  }
}
```

**Status Codes:**
- `200 OK` - Tile enabled successfully
- `400 Bad Request` - Invalid tile ID format
- `404 Not Found` - Tile or active scene not found
- `500 Internal Server Error` - Failed to access project state

### POST /tiles/:id/disable

Disable a tile by starting its fade-out transition. For loop tiles, this begins the fade-out process. One-shot tiles will complete their current cycle and stop.

**Path Parameters:**
- `id` - The tile ID (64-bit unsigned integer as string)

**Example:**
```bash
curl -X POST http://localhost:3001/tiles/67890/disable
```

**Response:**
```json
{
  "success": true,
  "tile": {
    "id": "67890",
    "name": "Red Strobe",
    "x": 0,
    "y": 0,
    "priority": 1,
    "enabled": false,
    "amount": 0.0
  }
}
```

**Status Codes:**
- `200 OK` - Tile disabled successfully
- `400 Bad Request` - Invalid tile ID format
- `404 Not Found` - Tile or active scene not found
- `500 Internal Server Error` - Failed to access project state

### POST /tiles/:id/amount

Set the absolute strength/amount of a tile, bypassing normal fade transitions. This is useful for manual dimming or creating custom fade patterns.

**Path Parameters:**
- `id` - The tile ID (64-bit unsigned integer as string)

**Request Body:**
```json
{
  "amount": 0.5
}
```

**Amount Field:**
- Type: `float` (f32)
- Range: `0.0` to `1.0`
- `0.0` = completely off
- `1.0` = full strength
- Values are clamped to this range

**Example:**
```bash
curl -X POST http://localhost:3001/tiles/67890/amount \
  -H "Content-Type: application/json" \
  -d '{"amount": 0.75}'
```

**Response:**
```json
{
  "success": true,
  "tile": {
    "id": "67890",
    "name": "Red Strobe",
    "x": 0,
    "y": 0,
    "priority": 1,
    "enabled": true,
    "amount": 0.75
  }
}
```

**Status Codes:**
- `200 OK` - Tile amount set successfully
- `400 Bad Request` - Invalid tile ID format or amount out of range
- `404 Not Found` - Tile or active scene not found
- `500 Internal Server Error` - Failed to access project state

## Tile State Management

### Tile Transitions

Tiles in the DMX controller have three possible transition states:

1. **start_fade_in_ms**: Tile is fading in or fully on (timestamp when fade started)
2. **start_fade_out_ms**: Tile is fading out or fully off (timestamp when fade started)
3. **absolute_strength**: Direct strength control (0.0-1.0), bypassing fade logic

### Timing Details

Tiles can have two timing modes:

1. **One-Shot**: Plays once for a specified duration, then stops
   - Enable: Always restarts from the beginning
   - Disable: Allows current cycle to complete

2. **Loop**: Continuously loops with fade-in and fade-out
   - Enable: Begins fade-in transition
   - Disable: Begins fade-out transition
   - Fade durations can be beat-synchronized or time-based

### Beat Synchronization

Tile durations and fades can be synchronized to the project's beat metadata (BPM). The MCP server respects these settings when enabling/disabling tiles.

## Implementation Details

### Code Location

- **Module**: `/src-tauri/src/mcp.rs`
- **Initialization**: `/src-tauri/src/lib.rs` (spawned as async task in `setup()`)
- **Dependencies**: Added to `/src-tauri/Cargo.toml`

### Dependencies Used

```toml
axum = "0.7"
tower = "0.5"
tower-http = { version = "0.6", features = ["cors"] }
tokio = { version = "1.48.0", features = ["rt-multi-thread"] }
```

### Thread Safety

The MCP server accesses the global `PROJECT_REF` which is a `Lazy<Mutex<Project>>`. All tile modifications are protected by this mutex to ensure thread-safe access across:

- Tauri IPC commands (from React frontend)
- Output loops (DMX/WLED rendering)
- MCP HTTP server (external control)

### Server Lifecycle

1. **Startup**: HTTP server starts automatically in `tauri::Builder::setup()`
2. **Runtime**: Runs on separate tokio task (non-blocking)
3. **Shutdown**: Gracefully closes when application exits

## Example Usage

### Python Client

```python
import requests

# Get all tiles
response = requests.get('http://localhost:3001/tiles')
tiles = response.json()['tiles']

# Enable first tile
tile_id = tiles[0]['id']
requests.post(f'http://localhost:3001/tiles/{tile_id}/enable')

# Set tile to 50% strength
requests.post(
    f'http://localhost:3001/tiles/{tile_id}/amount',
    json={'amount': 0.5}
)

# Disable tile
requests.post(f'http://localhost:3001/tiles/{tile_id}/disable')
```

### JavaScript/TypeScript Client

```typescript
// Get all tiles
const response = await fetch('http://localhost:3001/tiles');
const { tiles } = await response.json();

// Enable first tile
const tileId = tiles[0].id;
await fetch(`http://localhost:3001/tiles/${tileId}/enable`, {
  method: 'POST'
});

// Set tile to 75% strength
await fetch(`http://localhost:3001/tiles/${tileId}/amount`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ amount: 0.75 })
});

// Disable tile
await fetch(`http://localhost:3001/tiles/${tileId}/disable`, {
  method: 'POST'
});
```

### curl Examples

```bash
# Health check
curl http://localhost:3001/health

# List all tiles
curl http://localhost:3001/tiles

# Enable tile ID 12345
curl -X POST http://localhost:3001/tiles/12345/enable

# Disable tile ID 12345
curl -X POST http://localhost:3001/tiles/12345/disable

# Set tile to 50% strength
curl -X POST http://localhost:3001/tiles/12345/amount \
  -H "Content-Type: application/json" \
  -d '{"amount": 0.5}'
```

## Security Considerations

- **Localhost Only**: Server binds to `127.0.0.1` - not accessible from network
- **No Authentication**: Suitable for local control only
- **CORS Enabled**: Permissive CORS for local development
- **State Safety**: Mutex-protected access prevents race conditions

For production deployments or network access, consider adding:
- API key authentication
- Rate limiting
- HTTPS/TLS encryption
- IP allowlist
- Request logging

## Troubleshooting

### Server Not Starting

Check the console output for error messages. The server logs its startup status:

```
DMX MCP Server listening on http://127.0.0.1:3001
Available endpoints:
  GET  /health - Health check
  GET  /tiles - List all tiles in active scene
  POST /tiles/:id/enable - Enable a tile
  POST /tiles/:id/disable - Disable a tile
  POST /tiles/:id/amount - Set tile amount (body: { "amount": 0.0-1.0 })
```

### Port Already in Use

If port 3001 is already in use, modify `src-tauri/src/mcp.rs`:

```rust
let addr = SocketAddr::from(([127, 0, 0, 1], 3001)); // Change port here
```

### Tile Not Found Errors

- Verify the tile ID is correct using `GET /tiles`
- Ensure you're using the active scene's tiles
- Tile IDs are 64-bit integers (large numbers)

### Project State Lock Errors

If you see "Failed to lock project" errors, the project state may be poisoned from a panic. Restart the application to recover.

## Future Enhancements

Possible improvements to the MCP server:

- [ ] WebSocket support for real-time tile state updates
- [ ] Scene switching endpoints
- [ ] Batch tile operations (enable/disable multiple)
- [ ] Playlist/sequence triggering
- [ ] Color palette control
- [ ] Beat/tempo control
- [ ] Authentication/authorization
- [ ] Server-Sent Events (SSE) for state streaming
