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

**Effect System:**

- Static effects for fixed states
- Ramp effects for smooth transitions
- Strobe effects for dynamic flashing
- Random effects for organic movement
- Sequence effects for programmed patterns
- **Preset effects:**
  - Rainbow: HSV-based rainbow color cycle
  - Circle: Circular pan/tilt movements

**Fixture Management:**

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

## Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io/) package manager
- [Rust](https://rustup.rs/) (for building)
- [Buf CLI](https://buf.build/docs/installation) (for protobuf generation)

## Building

### Installing Dependencies

```bash
pnpm install
```

### Running the App

```bash
pnpm run tauri:dev
```

For iOS development:

```bash
pnpm run tauri:ios
```

### Building for Production

```bash
pnpm run build
```

The build output will be in the `dist/` directory.

## Development

For frontend development with hot reload:

```bash
pnpm run dev
```

This starts the Vite development server on https://localhost:8080. The Tauri app can connect to this dev server for faster iteration.

See [CLAUDE.md](CLAUDE.md) for comprehensive development documentation including:

- Architecture overview
- Build system details
- Key files and components
- Code style guidelines
- Development workflow recommendations

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
