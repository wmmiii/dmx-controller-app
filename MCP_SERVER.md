# DMX Controller MCP Server

This document describes the MCP (Model Context Protocol) server implementation for controlling tiles in the DMX controller application.

## Overview

The MCP server is embedded directly in the Rust/Tauri process and provides a standardized protocol for external control of tiles in the currently active scene. The server runs on `http://localhost:3001` and starts automatically when the application launches.

## Architecture

- **Protocol**: MCP (Model Context Protocol) version 2024-11-05
- **Transport**: JSON-RPC 2.0 over HTTP
- **Port**: 3001 (localhost only)
- **State Management**: Direct access to `PROJECT_REF` global state
- **Concurrency**: Thread-safe mutex-protected access
- **CORS**: Enabled (permissive for local development)

## MCP Protocol Compliance

This server implements the official Model Context Protocol specification, which means:

1. **Standardized handshake** via `initialize` method
2. **Capability discovery** - server declares available tools
3. **Tool execution** via `tools/call` method
4. **JSON-RPC 2.0** message format
5. **Compatible with MCP clients** like Claude Desktop

## JSON-RPC 2.0 Message Format

All requests and responses use JSON-RPC 2.0 format:

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "method_name",
  "params": { ...parameters... },
  "id": 1
}
```

**Success Response:**
```json
{
  "jsonrpc": "2.0",
  "result": { ...result data... },
  "id": 1
}
```

**Error Response:**
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32601,
    "message": "Method not found"
  },
  "id": 1
}
```

## MCP Methods

### initialize

Initialize the MCP connection and get server capabilities. This should be the first method called by any MCP client.

**Request:**
```bash
curl -X POST http://localhost:3001 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "clientInfo": {
        "name": "my-client",
        "version": "1.0.0"
      }
    },
    "id": 1
  }'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {
        "listChanged": false
      }
    },
    "serverInfo": {
      "name": "dmx-controller-mcp",
      "version": "0.1.0"
    }
  },
  "id": 1
}
```

### tools/list

List all available tools that can be called on this server.

**Request:**
```bash
curl -X POST http://localhost:3001 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 2
  }'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
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
  },
  "id": 2
}
```

### tools/call

Execute a specific tool with provided arguments.

**Request (list_tiles):**
```bash
curl -X POST http://localhost:3001 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "list_tiles",
      "arguments": {}
    },
    "id": 3
  }'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Active scene tiles:\n[\n  {\n    \"id\": \"12345\",\n    \"name\": \"Red Strobe\",\n    \"x\": 0,\n    \"y\": 0,\n    \"priority\": 1,\n    \"enabled\": true,\n    \"amount\": 1.0\n  }\n]"
      }
    ]
  },
  "id": 3
}
```

**Request (enable_tile):**
```bash
curl -X POST http://localhost:3001 \
  -H "Content-Type": application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "enable_tile",
      "arguments": {
        "tile_id": "12345"
      }
    },
    "id": 4
  }'
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Tile enabled successfully:\n{\n  \"id\": \"12345\",\n  \"name\": \"Red Strobe\",\n  \"x\": 0,\n  \"y\": 0,\n  \"priority\": 1,\n  \"enabled\": true,\n  \"amount\": 1.0\n}"
      }
    ]
  },
  "id": 4
}
```

**Request (disable_tile):**
```bash
curl -X POST http://localhost:3001 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "disable_tile",
      "arguments": {
        "tile_id": "12345"
      }
    },
    "id": 5
  }'
```

**Request (set_tile_amount):**
```bash
curl -X POST http://localhost:3001 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "set_tile_amount",
      "arguments": {
        "tile_id": "12345",
        "amount": 0.75
      }
    },
    "id": 6
  }'
```

## Available Tools

### list_tiles

Lists all tiles in the currently active scene with their state.

**Arguments:** None

**Returns:** JSON array of tile objects with properties:
- `id` - Unique tile identifier
- `name` - Display name
- `x`, `y` - Grid position
- `priority` - Render priority
- `enabled` - Whether tile is currently active
- `amount` - Current strength (0.0-1.0)

### enable_tile

Enables a tile by starting its fade-in transition. For one-shot tiles, this restarts them from the beginning.

**Arguments:**
- `tile_id` (string, required) - The ID of the tile to enable

**Returns:** Updated tile information

### disable_tile

Disables a tile by starting its fade-out transition.

**Arguments:**
- `tile_id` (string, required) - The ID of the tile to disable

**Returns:** Updated tile information

### set_tile_amount

Sets the absolute strength/amount of a tile (0.0 to 1.0), bypassing normal fade transitions.

**Arguments:**
- `tile_id` (string, required) - The ID of the tile to control
- `amount` (number, required) - Strength from 0.0 (off) to 1.0 (full)

**Returns:** Updated tile information

## JSON-RPC Error Codes

The server uses standard JSON-RPC 2.0 error codes:

| Code | Message | Description |
|------|---------|-------------|
| -32700 | Parse error | Invalid JSON |
| -32600 | Invalid Request | Not a valid JSON-RPC request |
| -32601 | Method not found | Method doesn't exist |
| -32602 | Invalid params | Invalid method parameters |
| -32000 | Server error | Application-specific error (tile not found, etc.) |

## Implementation Details

### Code Location

- **Module**: `/src-tauri/src/mcp.rs`
- **Initialization**: `/src-tauri/src/lib.rs` (spawned as async task in `setup()`)
- **Dependencies**: Added to `/src-tauri/Cargo.toml`

### Dependencies Used

All dependencies are already present as transitive dependencies through Tauri and reqwest:

```toml
hyper = { version = "1.8", features = ["server", "http1"] }
hyper-util = { version = "0.1", features = ["tokio"] }
http-body-util = "0.1"
tokio = { version = "1.48.0", features = ["rt-multi-thread"] }
serde_json = "1.0"
```

These are the same HTTP libraries used by reqwest, minimizing additional dependencies.

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
import json

def mcp_call(method, params=None, request_id=1):
    """Make an MCP JSON-RPC 2.0 request"""
    payload = {
        "jsonrpc": "2.0",
        "method": method,
        "id": request_id
    }
    if params:
        payload["params"] = params

    response = requests.post(
        'http://localhost:3001',
        headers={'Content-Type': 'application/json'},
        data=json.dumps(payload)
    )
    return response.json()

# Initialize connection
init_result = mcp_call("initialize", {
    "protocolVersion": "2024-11-05",
    "clientInfo": {"name": "python-client", "version": "1.0"}
})
print("Server:", init_result["result"]["serverInfo"])

# List available tools
tools = mcp_call("tools/list")
print("\nAvailable tools:")
for tool in tools["result"]["tools"]:
    print(f"  - {tool['name']}: {tool['description']}")

# List tiles
tiles_result = mcp_call("tools/call", {
    "name": "list_tiles",
    "arguments": {}
})
print("\nTiles:", tiles_result["result"]["content"][0]["text"])

# Enable a tile
tile_id = "12345"  # Replace with actual tile ID
enable_result = mcp_call("tools/call", {
    "name": "enable_tile",
    "arguments": {"tile_id": tile_id}
})
print(f"\nEnabled tile: {enable_result['result']['content'][0]['text']}")

# Set tile to 50%
set_result = mcp_call("tools/call", {
    "name": "set_tile_amount",
    "arguments": {"tile_id": tile_id, "amount": 0.5}
})
print(f"\nSet amount: {set_result['result']['content'][0]['text']}")

# Disable tile
disable_result = mcp_call("tools/call", {
    "name": "disable_tile",
    "arguments": {"tile_id": tile_id}
})
print(f"\nDisabled tile: {disable_result['result']['content'][0]['text']}")
```

### JavaScript/TypeScript Client

```typescript
async function mcpCall(method: string, params?: any, id: number = 1) {
  const response = await fetch('http://localhost:3001', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id
    })
  });
  return await response.json();
}

// Initialize
const initResult = await mcpCall('initialize', {
  protocolVersion: '2024-11-05',
  clientInfo: { name: 'ts-client', version: '1.0' }
});
console.log('Server:', initResult.result.serverInfo);

// List tools
const toolsResult = await mcpCall('tools/list');
console.log('Tools:', toolsResult.result.tools);

// List tiles
const tilesResult = await mcpCall('tools/call', {
  name: 'list_tiles',
  arguments: {}
});
console.log('Tiles:', tilesResult.result.content[0].text);

// Enable tile
const tileId = '12345';
const enableResult = await mcpCall('tools/call', {
  name: 'enable_tile',
  arguments: { tile_id: tileId }
});
console.log('Enabled:', enableResult.result.content[0].text);

// Set amount
const setResult = await mcpCall('tools/call', {
  name: 'set_tile_amount',
  arguments: { tile_id: tileId, amount: 0.75 }
});
console.log('Set amount:', setResult.result.content[0].text);

// Disable tile
const disableResult = await mcpCall('tools/call', {
  name: 'disable_tile',
  arguments: { tile_id: tileId }
});
console.log('Disabled:', disableResult.result.content[0].text);
```

## Using with Claude Desktop

To use this MCP server with Claude Desktop or other MCP clients:

1. **Start the Tauri application** - The MCP server starts automatically on port 3001
2. **Configure your MCP client** to connect to `http://localhost:3001`
3. **The client will**:
   - Call `initialize` to establish the connection
   - Call `tools/list` to discover available tools
   - Call `tools/call` to execute tools as needed

The MCP protocol ensures that Claude or other AI assistants can discover and use the tile control capabilities automatically without hardcoding the API.

## Security Considerations

- **Localhost Only**: Server binds to `127.0.0.1` - not accessible from network
- **No Authentication**: Suitable for local control only
- **CORS Enabled**: Permissive CORS for local development
- **State Safety**: Mutex-protected access prevents race conditions

For production deployments or network access, consider adding:
- API key authentication in JSON-RPC params
- Rate limiting
- HTTPS/TLS encryption
- IP allowlist
- Request logging

## Troubleshooting

### Server Not Starting

Check the console output for error messages. The server logs its startup status:

```
DMX MCP Server listening on http://127.0.0.1:3001
Protocol: JSON-RPC 2.0 over HTTP
MCP Protocol Version: 2024-11-05
```

### Port Already in Use

If port 3001 is already in use, modify `src-tauri/src/mcp.rs`:

```rust
let addr = SocketAddr::from(([127, 0, 0, 1], 3001)); // Change port here
```

### Invalid JSON-RPC Errors

Ensure your requests include:
- `jsonrpc: "2.0"` field
- Valid `method` name
- Properly formatted `params` (if required)
- Numeric or string `id` field

### Tool Execution Errors

Check that:
- Tile IDs are correct (use `list_tiles` to verify)
- Argument names match the `inputSchema` exactly
- Amount values are between 0.0 and 1.0
- The active scene exists and has tiles

## MCP Specification

For more information about the Model Context Protocol, see:
- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [MCP Documentation](https://modelcontextprotocol.io/)
