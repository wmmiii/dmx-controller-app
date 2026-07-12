# DMX Controller App

You know what's easier than learning free DMX controller software?

Writing DMX controller software.

A professional DMX lighting controller built with React, TypeScript, Rust, and Tauri. Control your lighting fixtures with precision using a modern, cross-platform application.

## Features

**Performance Modes:**

- **Live Mode:** Tile-based grid interface for triggering effects in real-time

**Output Protocols:**

- **Serial DMX:** USB-DMX adapters via native serial port
- **sACN/E1.31:** Network DMX with support for unlimited universes
- **WLED:** Direct control of addressable LED strips and fixtures
- **DDP:** Direct control of pixel-mapped fixtures and displays over UDP

**Visualizer:**

- GLSL shader-based video effects, GPU-rendered via wgpu
- Compose shaders into trees (blend, sequence) for layered looks
- Map shader output onto virtual displays assembled from one or more physical pixel segments (DDP outputs), for video-wall style effects distinct from per-fixture DMX control

**Effect System:**

- Static effects for fixed states
- Ramp effects for smooth transitions
- Strobe effects for dynamic flashing
- Random effects for organic movement
- Sequence effects for programmed patterns
- **Preset effects:**
  - Rainbow: HSV-based rainbow color cycle
  - Circle: Circular pan/tilt movements

**DMX Fixture Management:**

- GDTF fixture profile import
- Custom fixture profile creation
- Fixture grouping for synchronized control
- 512-channel DMX universe support per output

**Beat Synchronization:**

- Manual BPM and first beat configuration
- Tap tempo for manual sync
- Beat-synchronized effect timing

**Controller Integration:**

- MIDI controller support
- Configurable controller bindings
- Real-time controller feedback

**Project Management:**

- Binary protobuf serialization for efficient storage
- Undo/redo stack (max 100 operations)
- Import/export project files

## Output Protocols

### Serial DMX

Native support for USB-DMX adapters. Connect any standard DMX USB interface to your computer and configure it in the Patch page.

### sACN/E1.31

Network DMX support with no additional hardware required. Configure your sACN receiver's IP address and universe number in the Patch page.

### WLED

Control WLED-compatible addressable LED devices over your network. Configure the WLED device IP address in the Patch page.

### DDP

Control DDP-compatible pixel devices over your network. Configure the device IP address and pixel segments in the Patch page.

## Visualizer

Compose GLSL shaders into blend/sequence trees and drive them onto virtual displays assembled from one or more physical pixel segments (DDP outputs), for video-wall style effects. Configure virtual displays and shaders from the Display and Visualizer tabs on the Patch page.

## Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io/) (v10) package manager
- [Rust](https://rustup.rs/) (stable toolchain), with the WASM target installed:
  ```bash
  rustup target add wasm32-unknown-unknown
  ```

Buf, protoc, and wasm-pack are installed automatically as dev dependencies (`pnpm install`) — no separate install needed for any of them.

**Desktop app (Tauri) system dependencies:**

- **Linux:** `libwebkit2gtk-4.1-dev`, `build-essential`, `libxdo-dev`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libudev-dev`, `libasound2-dev`
- **macOS:** Xcode Command Line Tools
- **Windows:** Microsoft C++ Build Tools and WebView2 (see [Tauri's prerequisites guide](https://v2.tauri.app/start/prerequisites/) for full platform setup)

## Building

### Installing Dependencies

```bash
pnpm install
```

### Running the App

```bash
pnpm run tauri:dev
```

For iOS development (requires Xcode):

```bash
pnpm run tauri:ios
```

### Building for Production

```bash
pnpm run build
```

The build output will be in the `dist/` directory.

## Testing

```bash
pnpm run test
```

Runs both Jest tests for TypeScript and Cargo tests for Rust.

## Code Quality

```bash
pnpm run cleanup
```

Runs linters (ESLint, Clippy, Knip) and Prettier formatting.

## Documentation

For AI-assisted development, see [CLAUDE.md](CLAUDE.md) which provides guidance for Claude Code when working with this repository.

## License & Legal

The source code is licensed under the [Apache License, Version 2.0](LICENSE).

Use of the application is also subject to the following, which include important safety, warranty, and liability information:

- [Terms of Service](https://dmx-controller.app/terms.html)
- [Privacy Policy](https://dmx-controller.app/privacy.html)
