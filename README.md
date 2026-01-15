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

### Quick Start

```bash
# Get all tiles in active scene
curl http://localhost:3001/tiles

# Enable a tile
curl -X POST http://localhost:3001/tiles/{tile_id}/enable

# Disable a tile
curl -X POST http://localhost:3001/tiles/{tile_id}/disable

# Set tile strength (0.0 - 1.0)
curl -X POST http://localhost:3001/tiles/{tile_id}/amount \
  -H "Content-Type: application/json" \
  -d '{"amount": 0.5}'
```

For complete API documentation, see [MCP_SERVER.md](MCP_SERVER.md).
