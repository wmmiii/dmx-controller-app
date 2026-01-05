// MCP Server implementation
//
// Implements the Model Context Protocol (MCP) server over stdio transport.
// The server listens for JSON-RPC requests from AI assistants and responds
// with tool results.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{self, BufRead, Write};
use tauri::AppHandle;

/// MCP JSON-RPC request
#[derive(Debug, Deserialize)]
struct McpRequest {
    jsonrpc: String,
    method: String,
    params: Option<Value>,
    id: Option<Value>,
}

/// MCP JSON-RPC response
#[derive(Debug, Serialize)]
struct McpResponse {
    jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<McpError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<Value>,
}

/// MCP error structure
#[derive(Debug, Serialize)]
pub struct McpError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

/// MCP Server state
pub struct McpServer {
    app: AppHandle,
}

impl McpServer {
    /// Create a new MCP server
    pub fn new(app: AppHandle) -> Self {
        McpServer { app }
    }

    /// Start the MCP server on stdio
    ///
    /// This function reads JSON-RPC requests from stdin and writes responses to stdout.
    /// It runs indefinitely until stdin is closed.
    pub async fn start_stdio(&self) {
        log::info!("MCP server starting on stdio");

        let stdin = io::stdin();
        let mut stdout = io::stdout();

        for line in stdin.lock().lines() {
            match line {
                Ok(line) => {
                    if line.trim().is_empty() {
                        continue;
                    }

                    // Parse request
                    let request: Result<McpRequest, _> = serde_json::from_str(&line);

                    let response = match request {
                        Ok(req) => self.handle_request(req).await,
                        Err(e) => McpResponse {
                            jsonrpc: "2.0".to_string(),
                            result: None,
                            error: Some(McpError {
                                code: -32700, // Parse error
                                message: format!("Parse error: {}", e),
                                data: None,
                            }),
                            id: None,
                        },
                    };

                    // Write response
                    if let Ok(response_json) = serde_json::to_string(&response) {
                        if let Err(e) = writeln!(stdout, "{}", response_json) {
                            log::error!("Failed to write MCP response: {}", e);
                            break;
                        }
                        if let Err(e) = stdout.flush() {
                            log::error!("Failed to flush stdout: {}", e);
                            break;
                        }
                    }
                }
                Err(e) => {
                    log::error!("Error reading from stdin: {}", e);
                    break;
                }
            }
        }

        log::info!("MCP server stopped");
    }

    /// Handle an MCP request
    async fn handle_request(&self, request: McpRequest) -> McpResponse {
        log::debug!("MCP request: method={}, id={:?}", request.method, request.id);

        // Route to appropriate handler
        let result = match request.method.as_str() {
            "tools/list" => self.handle_tools_list(),
            "tools/call" => self.handle_tool_call(request.params).await,
            "resources/list" => self.handle_resources_list(),
            "resources/read" => self.handle_resource_read(request.params).await,
            _ => Err(McpError {
                code: -32601, // Method not found
                message: format!("Method not found: {}", request.method),
                data: None,
            }),
        };

        match result {
            Ok(result) => McpResponse {
                jsonrpc: "2.0".to_string(),
                result: Some(result),
                error: None,
                id: request.id,
            },
            Err(error) => McpResponse {
                jsonrpc: "2.0".to_string(),
                result: None,
                error: Some(error),
                id: request.id,
            },
        }
    }

    /// Handle tools/list request
    fn handle_tools_list(&self) -> Result<Value, McpError> {
        Ok(serde_json::json!({
            "tools": [
                {
                    "name": "get_current_scene",
                    "description": "Get the current active scene with all tiles",
                    "inputSchema": {
                        "type": "object",
                        "properties": {},
                        "required": []
                    }
                },
                {
                    "name": "list_fixtures_and_groups",
                    "description": "List all available fixtures and groups in the current patch",
                    "inputSchema": {
                        "type": "object",
                        "properties": {},
                        "required": []
                    }
                },
                {
                    "name": "get_examples",
                    "description": "Get example tiles for learning common lighting patterns",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "category": {
                                "type": "string",
                                "description": "Optional category filter (static, breathing, strobe, color_change, buildup, impact)"
                            },
                            "search": {
                                "type": "string",
                                "description": "Optional search query to filter examples"
                            }
                        },
                        "required": []
                    }
                },
                // TODO: Add more tools: create_tile, modify_tile, delete_tile, etc.
            ]
        }))
    }

    /// Handle tools/call request
    async fn handle_tool_call(&self, params: Option<Value>) -> Result<Value, McpError> {
        let params = params.ok_or(McpError {
            code: -32602, // Invalid params
            message: "Missing params".to_string(),
            data: None,
        })?;

        let tool_name = params.get("name").and_then(|v| v.as_str()).ok_or(McpError {
            code: -32602,
            message: "Missing tool name".to_string(),
            data: None,
        })?;

        let arguments = params.get("arguments").unwrap_or(&Value::Null);

        log::debug!("Calling tool: {}", tool_name);

        match tool_name {
            "get_current_scene" => crate::mcp::tools::get_current_scene(&self.app).await,
            "list_fixtures_and_groups" => crate::mcp::tools::list_fixtures_and_groups(&self.app).await,
            "get_examples" => crate::mcp::tools::get_examples(arguments).await,
            _ => Err(McpError {
                code: -32601,
                message: format!("Unknown tool: {}", tool_name),
                data: None,
            }),
        }
    }

    /// Handle resources/list request
    fn handle_resources_list(&self) -> Result<Value, McpError> {
        Ok(serde_json::json!({
            "resources": [
                {
                    "uri": "dmx://fixtures",
                    "name": "Fixture Library",
                    "description": "All available fixtures in the current patch",
                    "mimeType": "application/json"
                },
                {
                    "uri": "dmx://examples",
                    "name": "Example Tiles",
                    "description": "Example tiles for common lighting patterns",
                    "mimeType": "application/json"
                }
            ]
        }))
    }

    /// Handle resources/read request
    async fn handle_resource_read(&self, params: Option<Value>) -> Result<Value, McpError> {
        let params = params.ok_or(McpError {
            code: -32602,
            message: "Missing params".to_string(),
            data: None,
        })?;

        let uri = params.get("uri").and_then(|v| v.as_str()).ok_or(McpError {
            code: -32602,
            message: "Missing resource URI".to_string(),
            data: None,
        })?;

        match uri {
            "dmx://fixtures" => crate::mcp::tools::list_fixtures_and_groups(&self.app).await,
            "dmx://examples" => crate::mcp::tools::get_examples(&Value::Null).await,
            _ => Err(McpError {
                code: -32602,
                message: format!("Unknown resource URI: {}", uri),
                data: None,
            }),
        }
    }
}
