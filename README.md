# DMX Controller App

You know what's easier than learning free DMX controller software?

Writing DMX controller software.

Hosted at https://dmx-controller.app

## Attaching to a DMX universe

To attach to a DMX universe this software requires special hardware to interface with DMX fixtures. Unfortunately certain browser behaviors prohibit using off the shelf UART boards to convert from USB serial to DMX.

The current solution is to use a [SparkFun ESP32 Thing Plus DMX to LED Shield](https://www.sparkfun.com/products/15110) along with a [
SparkFun Thing Plus - ESP32-S2 WROOM](https://www.sparkfun.com/products/17743) running custom software to perform the conversion.

@wmmiii has not yet published the custom software but if you ask nicely I'll clean up the code and stick it on my GitHub.

## Building

### Prerequisites

You need [Node.js](https://nodejs.org/) (v20+) and [pnpm](https://pnpm.io/) installed on your machine.

### Running a dev server

First install dependencies:

```
pnpm install
```

Then run the development server:

```
pnpm run dev
```

and navigate to https://localhost:8080 using your favorite (Chromium) web browser. You may need to add security exceptions to allow the self-signed certificate to work. (Try typing "thisisunsafe" in the browser window if Chrome gives you an TLS warning).

### Building for production

```
pnpm run build
```

The build output will be in the `dist/` directory.

## HTTP MCP Server

The application includes an embedded HTTP MCP (Model Context Protocol) server for external control of tiles in the active scene. The server runs automatically on `http://localhost:3001` when the Tauri desktop application starts.

The MCP server uses JSON-RPC 2.0 and follows the official MCP specification, making it compatible with Claude Desktop and other MCP clients.

### Quick Start

```bash
# Initialize connection
curl -X POST http://localhost:3001 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {"protocolVersion": "2024-11-05"}, "id": 1}'

# List available tools
curl -X POST http://localhost:3001 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 2}'

# Call a tool (list tiles)
curl -X POST http://localhost:3001 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "list_tiles", "arguments": {}}, "id": 3}'
```

For complete API documentation, see [MCP_SERVER.md](MCP_SERVER.md).
