pub(crate) mod bridge;
mod utils;
mod visualizer;

use std::net::SocketAddr;
use std::sync::Arc;

use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::streamable_http_server::{StreamableHttpServerConfig, StreamableHttpService};
use rmcp::{ServerHandler, tool_handler};
use tauri::AppHandle;

const DEFAULT_PORT: u16 = 41324;
const MCP_PATH: &str = "/mcp";

#[derive(Clone)]
pub struct AppMcp {
    app: AppHandle,
}

impl AppMcp {
    fn new(app: AppHandle) -> Self {
        Self { app }
    }

    fn server_router() -> ToolRouter<Self> {
        Self::visualizer_router()
    }
}

#[tool_handler(
    router = Self::server_router(),
    name = "DMX Controller App",
    instructions = "Read and edit the DMX Controller App lighting project currently open in the desktop app."
)]
impl ServerHandler for AppMcp {}

/// Spawn the in-process MCP server on Tauri's async runtime.
///
/// Binds loopback-only. rmcp validates the inbound `Host` header against
/// `allowed_hosts` (loopback by default) and, because we set `allowed_origins`
/// below, rejects requests bearing a foreign browser `Origin` — together these
/// block DNS-rebinding / cross-site access from a page in the user's browser.
pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = serve(app, DEFAULT_PORT).await {
            log::error!("MCP server exited: {e}");
        }
    });
}

async fn serve(app: AppHandle, port: u16) -> std::io::Result<()> {
    // Non-empty list enables Origin validation: requests with no Origin (native
    // MCP clients, curl) pass; requests with any other Origin are rejected.
    // `allowed_hosts` keeps its loopback default.
    let config = StreamableHttpServerConfig::default().with_allowed_origins([
        format!("http://127.0.0.1:{port}"),
        format!("http://localhost:{port}"),
    ]);

    let service = StreamableHttpService::new(
        move || Ok(AppMcp::new(app.clone())),
        Arc::new(LocalSessionManager::default()),
        config,
    );

    let router = axum::Router::new().nest_service(MCP_PATH, service);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    log::info!("MCP server listening on http://{addr}{MCP_PATH}");

    axum::serve(listener, router).await
}
