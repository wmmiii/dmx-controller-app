# AI MCP Server Implementation Plan
## DMX Controller Tile Builder

## Overview

This document outlines the design and implementation of an AI-powered Model Context Protocol (MCP) server for creating and modifying lighting tiles in the DMX Controller app. The MCP server will be embedded in the Tauri Rust backend, allowing AI assistants to understand natural language descriptions of lighting effects and generate appropriate tile configurations.

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────┐
│                    AI Assistant (Claude)                 │
│              (via MCP client - Desktop app)              │
└────────────────────┬────────────────────────────────────┘
                     │ MCP Protocol (stdio/HTTP)
                     │
┌────────────────────▼────────────────────────────────────┐
│              MCP Server (Rust - Tauri)                   │
│  ┌──────────────────────────────────────────────────┐  │
│  │ MCP Tools:                                        │  │
│  │  - get_current_scene                             │  │
│  │  - list_fixtures_and_groups                      │  │
│  │  - get_fixture_capabilities                      │  │
│  │  - create_tile                                   │  │
│  │  - modify_tile                                   │  │
│  │  - delete_tile                                   │  │
│  │  - list_color_palettes                           │  │
│  │  - get_examples (learn from user examples)       │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Project State Management                          │  │
│  │  - Access to dmx-engine PROJECT_REF              │  │
│  │  - Protobuf serialization/deserialization        │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│           DMX Engine (Rust Library)                      │
│         Scene Rendering & Output Loops                   │
└──────────────────────────────────────────────────────────┘
```

### Integration Points

1. **MCP Server Module** (`src-tauri/src/mcp/`)
   - New Rust module in the Tauri backend
   - Implements MCP protocol (JSON-RPC over stdio or HTTP)
   - Provides tools for tile manipulation

2. **Project State Access**
   - Use existing `PROJECT_REF` from `dmx-engine`
   - Read/write Scene, Tile, Effect structures
   - Leverage existing protobuf definitions

3. **Example Storage**
   - Store user-provided examples in project assets
   - Examples: tile description + protobuf definition
   - AI learns lighting patterns from examples

## MCP Protocol Design

### Tools (AI Callable Functions)

#### 1. `get_current_scene`
**Description**: Retrieve the current active scene with all tiles
**Input**: None
**Output**: JSON representation of Scene protobuf
```json
{
  "name": "Main Scene",
  "tiles": [
    {
      "id": "12345",
      "name": "Red wash",
      "position": {"x": 0, "y": 0},
      "priority": 10,
      "channels": [...]
    }
  ],
  "color_palettes": {...}
}
```

#### 2. `list_fixtures_and_groups`
**Description**: List all available fixtures and groups in the current patch
**Input**: None
**Output**: JSON with fixtures and groups
```json
{
  "fixtures": [
    {
      "id": "1",
      "name": "Moving Head 1",
      "type": "GDTF_MovingHead",
      "capabilities": ["dimmer", "color", "pan", "tilt", "zoom"]
    }
  ],
  "groups": [
    {
      "id": "100",
      "name": "All Par Cans",
      "fixture_ids": ["1", "2", "3", "4"]
    }
  ]
}
```

#### 3. `get_fixture_capabilities`
**Description**: Get detailed capabilities of a specific fixture type
**Input**: `fixture_definition_id: string`
**Output**: JSON with fixture channels and ranges
```json
{
  "name": "Generic RGB PAR",
  "channels": {
    "dimmer": {"index": 0, "range": [0, 255]},
    "red": {"index": 1, "range": [0, 255]},
    "green": {"index": 2, "range": [0, 255]},
    "blue": {"index": 3, "range": [0, 255]}
  }
}
```

#### 4. `create_tile`
**Description**: Create a new tile in the current scene
**Input**: JSON representation of tile configuration
```json
{
  "name": "Blue strobe",
  "position": {"x": 1, "y": 0},
  "priority": 5,
  "duration_beats": 1.0,
  "fade_in_ms": 100,
  "fade_out_ms": 500,
  "one_shot": false,
  "channels": [
    {
      "effect": {
        "static_effect": {
          "color": {"r": 0, "g": 0, "b": 255},
          "dimmer": 1.0,
          "strobe": 0.8
        }
      },
      "output_target": {
        "group_id": "100"
      }
    }
  ]
}
```
**Output**: Created tile with assigned ID

#### 5. `modify_tile`
**Description**: Modify an existing tile
**Input**: Tile ID + partial tile configuration (merge semantics)
**Output**: Updated tile

#### 6. `delete_tile`
**Description**: Delete a tile by ID
**Input**: `tile_id: string`
**Output**: Success confirmation

#### 7. `list_color_palettes`
**Description**: List available color palettes
**Input**: None
**Output**: JSON with palette definitions

#### 8. `get_examples`
**Description**: Retrieve user-provided example tiles for AI learning
**Input**: Optional `category: string`
**Output**: Array of examples with descriptions and tile definitions
```json
[
  {
    "description": "A slow breathing effect on all fixtures, pulsing from dim to bright red",
    "category": "breathing",
    "tile": {...}
  }
]
```

#### 9. `add_example`
**Description**: Add a new example for AI learning
**Input**: Description + tile ID (or tile definition)
**Output**: Success confirmation

### Resources (AI Readable Data)

1. **Fixture Library** - Current patch fixtures and their definitions
2. **Effect Templates** - Common effect patterns (static, ramp, strobe, random)
3. **Example Library** - User-provided examples with descriptions

## Implementation Plan

### Phase 1: MCP Server Foundation (1-2 days)

**Files to Create:**
- `src-tauri/src/mcp/mod.rs` - Main MCP module
- `src-tauri/src/mcp/server.rs` - MCP server implementation
- `src-tauri/src/mcp/tools.rs` - Tool implementations
- `src-tauri/src/mcp/types.rs` - Type conversions (proto ↔ JSON)

**Dependencies to Add:**
```toml
# Cargo.toml
[dependencies]
mcp-server = "0.1" # or build from scratch using serde_json
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0" # already present
```

**Tasks:**
1. ✓ Create MCP server module structure
2. Implement JSON-RPC handler for MCP protocol
3. Set up stdio transport (for local AI assistant communication)
4. Add HTTP transport (optional, for remote AI access)
5. Integrate with Tauri app setup in `lib.rs`

### Phase 2: Tool Implementation (2-3 days)

**For each tool:**
1. Define input/output schemas
2. Implement protobuf ↔ JSON conversion
3. Access `PROJECT_REF` state
4. Perform operation (read/write Scene, Tiles)
5. Return formatted response

**Key Conversions:**
- `Scene` → JSON (with simplified structure)
- `Tile` → JSON (user-friendly format)
- `Effect` → JSON (nested effect types)
- `OutputTarget` → JSON (fixture/group references)
- JSON → Protobuf for create/modify operations

**Validation:**
- Ensure fixture/group IDs exist
- Validate effect parameters (ranges, types)
- Check for conflicting tile positions (warn, don't error)

### Phase 3: Example System (1 day)

**Example Storage:**
- Store examples in project assets: `Project.assets.ai_examples`
- Add new protobuf message:

```protobuf
// Add to project.proto or create new ai.proto
message AiExample {
  string id = 1;
  string description = 2;  // Natural language description
  string category = 3;     // "breathing", "strobe", "chase", etc.
  Scene.Tile tile = 4;     // The example tile
  repeated string tags = 5; // Searchable tags
}

message AiExamples {
  repeated AiExample examples = 1;
}

// Add to Project message:
// AiExamples ai_examples = XX;
```

**Example UI:**
- Add button to "Save as AI Example" in TileEditor
- Prompt user for description and category
- Store in project

### Phase 4: Tauri Integration (1 day)

**Startup:**
1. Launch MCP server on Tauri app startup
2. Listen on stdio or HTTP port
3. Log MCP server URL/connection info

**Commands:**
- Add Tauri command to get MCP server status
- Add UI indicator showing "AI Assistant Ready"

**Code in `lib.rs`:**
```rust
use crate::mcp::McpServer;

pub fn run() {
    tauri::Builder::default()
        // ... existing plugins ...
        .setup(|app| {
            // ... existing state ...

            // Initialize MCP server
            let mcp_server = McpServer::new(app.handle().clone());
            app.manage(Arc::new(Mutex::new(mcp_server)));

            // Start MCP server on stdio
            tauri::async_runtime::spawn(async move {
                mcp_server.start_stdio().await;
            });

            Ok(())
        })
        // ... rest of builder ...
}
```

### Phase 5: AI Prompting & Testing (1-2 days)

**System Prompt for AI:**
Create a comprehensive prompt that explains:
- DMX lighting concepts (fixtures, channels, effects)
- Available effect types and their purposes
- How to ask clarifying questions
- Example-driven learning

**Example Prompt:**
```
You are an AI assistant specialized in creating DMX lighting tiles.
Your role is to help users describe lighting effects in natural language
and generate appropriate tile configurations.

Key concepts:
- Fixtures: Physical lighting devices (PAR cans, moving heads, etc.)
- Groups: Collections of fixtures that act together
- Effects: Static, Ramp (animated), Strobe (flashing), Random, Sequence
- Tiles: Toggleable effect containers with fade in/out

When a user requests a lighting effect:
1. Identify target fixtures/groups (ask if unclear)
2. Understand the desired visual effect (color, movement, timing)
3. Choose appropriate effect type(s)
4. Set timing parameters (beat-synced or milliseconds)
5. Configure fade in/out for smooth transitions
6. Generate tile configuration and ask for confirmation

Before creating a tile, ALWAYS:
- Call get_current_scene() to see existing tiles
- Call list_fixtures_and_groups() to see available outputs
- Call get_examples() to learn from user's previous patterns
- Ask clarifying questions if the description is ambiguous

Examples:
[Include common examples here]
```

**Testing Scenarios:**
1. "Create a red wash on all PAR cans"
2. "Make the moving heads do a slow pan sweep"
3. "Fast blue strobe on group 1, synced to the beat"
4. "Rainbow chase effect across all fixtures"
5. "Dim everything to 50% over 2 seconds"

### Phase 6: Documentation & Polish (1 day)

**Documentation:**
- Add `MCP_SERVER.md` with setup instructions
- Document each MCP tool with examples
- Create user guide for providing examples
- Add troubleshooting section

**Polish:**
- Error handling and validation
- Logging for debugging
- Performance optimization (lazy serialization)
- Security: validate all inputs

## Technical Considerations

### Protobuf ↔ JSON Conversion

**Challenges:**
- Protobuf uses `oneof` for variants (e.g., `Effect.effect`)
- Need to flatten for JSON readability
- Handle 64-bit integers (use strings in JSON)

**Solution:**
Use `prost-reflect` or write custom serializers:
```rust
// src-tauri/src/mcp/types.rs
pub fn scene_to_json(scene: &Scene) -> serde_json::Value {
    json!({
        "name": scene.name,
        "tiles": scene.tile_map.iter().map(tile_to_json).collect::<Vec<_>>(),
        "color_palettes": // ... convert palettes
    })
}

pub fn tile_to_json(tile_map: &Scene_TileMap) -> serde_json::Value {
    json!({
        "id": tile_map.id.to_string(),
        "name": tile_map.tile.name,
        "position": {"x": tile_map.x, "y": tile_map.y},
        "priority": tile_map.priority,
        "channels": // ... convert channels
    })
}
```

### State Management

**Access Pattern:**
```rust
// Read-only access
let project = dmx_engine::get_project_ref();
let scene = project.scenes.get(&project.active_scene);

// Write access (requires mutable ref)
let mut project = dmx_engine::get_project_ref_mut();
let scene = project.scenes.get_mut(&project.active_scene).unwrap();
scene.tile_map.push(new_tile);
```

**Synchronization:**
- Tauri already has project state management
- MCP server should use same mechanisms
- Emit events to frontend when tiles change

### MCP Protocol Implementation

**Option 1: Use existing MCP SDK (if available in Rust)**
- Simplest approach
- Follow standard MCP protocol

**Option 2: Custom JSON-RPC implementation**
```rust
// MCP protocol is JSON-RPC 2.0
#[derive(Deserialize)]
struct McpRequest {
    jsonrpc: String,  // "2.0"
    method: String,   // "tools/call"
    params: serde_json::Value,
    id: serde_json::Value,
}

#[derive(Serialize)]
struct McpResponse {
    jsonrpc: String,
    result: serde_json::Value,
    id: serde_json::Value,
}
```

**Transport:**
- Stdio: Read from stdin, write to stdout (line-delimited JSON)
- HTTP: Optional HTTP server for remote access

### Example System Design

**Example Structure:**
```json
{
  "id": "ex_123",
  "description": "A slow breathing effect that pulses red light from 20% to 100% over 2 beats",
  "category": "breathing",
  "tags": ["red", "pulse", "slow", "breathing"],
  "tile": {
    "name": "Red Breath",
    "duration_beats": 2.0,
    "fade_in_ms": 100,
    "fade_out_ms": 100,
    "channels": [{
      "effect": {
        "ramp_effect": {
          "state_start": {"dimmer": 0.2, "color": {"r": 255, "g": 0, "b": 0}},
          "state_end": {"dimmer": 1.0, "color": {"r": 255, "g": 0, "b": 0}},
          "timing_mode": {
            "beat": {"multiplier": 1.0},
            "easing": "EASE_IN_OUT",
            "mirrored": true
          }
        }
      },
      "output_target": {"group_id": "100"}
    }]
  }
}
```

**Example Categories:**
- `breathing` - Slow pulse effects
- `strobe` - Fast flashing
- `chase` - Sequential patterns
- `sweep` - Movement effects (pan/tilt)
- `color_change` - Color transitions
- `buildup` - Gradual intensification
- `impact` - Sudden bright flashes

## User Workflow

1. **User describes effect**: "I want a slow blue breathing effect on all PAR cans"

2. **AI asks clarifying questions**:
   - "Should this be synced to the beat or time-based?"
   - "How slow? (e.g., 2 seconds, 4 beats)"
   - "Should it pulse from completely off or dim?"

3. **AI queries scene state**:
   - Calls `get_current_scene()` to see existing tiles
   - Calls `list_fixtures_and_groups()` to find "PAR cans" group
   - Calls `get_examples()` with category "breathing" to learn patterns

4. **AI generates tile**:
   - Creates ramp effect with blue color
   - Sets beat-synced timing with mirrored easing
   - Targets the PAR cans group
   - Configures smooth fade in/out

5. **AI presents for confirmation**:
   - "I'll create a tile called 'Blue Breath' that pulses blue light over 4 beats. It will fade in over 100ms and fade out over 500ms. Should I proceed?"

6. **Tile is created**:
   - Calls `create_tile()` with configuration
   - Tile appears in scene grid
   - User can toggle it on/off and see the effect

7. **Optional: Save as example**:
   - User likes the result and saves as example
   - Future "breathing" requests will learn from this pattern

## Next Steps

1. **Review this plan** - Ensure architecture aligns with project goals
2. **Prototype MCP server** - Build minimal tool (`get_current_scene`)
3. **Test with AI assistant** - Verify AI can call tools correctly
4. **Iterate on tool design** - Refine JSON schemas based on AI feedback
5. **Implement remaining tools** - Add create/modify/delete
6. **Build example system** - Enable AI learning from user patterns
7. **User testing** - Validate with real lighting scenarios

## Open Questions

1. **MCP Transport**: Stdio or HTTP? (Stdio recommended for local desktop app)
2. **Example Storage**: In project file or separate database?
3. **AI Access**: Should AI be able to modify existing tiles or only create new ones?
4. **Validation**: How strict should validation be? (e.g., allow overlapping tiles?)
5. **Multi-scene**: Should AI work across multiple scenes or just active scene?
6. **Undo/Redo**: Should MCP operations integrate with undo stack?

## Success Metrics

- AI can create basic tiles (static color) with 90%+ accuracy
- AI can ask appropriate clarifying questions when description is ambiguous
- AI learns from examples and generates consistent patterns
- User can describe effects in plain English without learning technical terms
- Tile creation via AI is faster than manual UI creation for common patterns

---

**Author**: Implementation Plan
**Date**: 2026-01-05
**Status**: Planning Phase
