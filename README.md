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

**Headless Operation:**

- Run an Autopilot show on a Linux system with no display

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

## Headless

`dmx-controller-app-headless` runs an Autopilot show with no display, no webview and
no user interface — for an installation that powers on and starts running.

```bash
dmx-controller-app-headless --project show.dmxapp --mode autopilot
```

Download `dmx-controller-app-headless-linux-arm64.tar.gz` (Raspberry Pi 3 and later
running 64-bit Raspberry Pi OS) or `dmx-controller-app-headless-linux-amd64.tar.gz`
from [GitHub Releases](https://github.com/wmmiii/dmx-controller-app/releases).
If you aren't sure which you need, run `dpkg --print-architecture` on the target
machine — it prints the same name. Binaries are built against glibc 2.35, so
they run on Raspberry Pi OS bookworm and newer.

To build it yourself you need Rust and `protoc` — either from `pnpm install`,
which fetches one into `node_modules`, or from your system's
`protobuf-compiler` package. Nothing else in the JS toolchain is involved.

```bash
cargo build --release -p dmx-controller-app-headless
```

### Options

| Flag                  | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `--project <PATH>`    | Required. A `.dmxapp` file exported from the desktop app.               |
| `--mode <MODE>`       | Required. `autopilot` is the only mode today.                           |
| `--log-level <LEVEL>` | Defaults to `info`. `RUST_LOG` refines it per module.                   |
| `--no-visualizer`     | Skip GPU initialization, disabling visualizer displays and DDP output.  |
| `--no-audio`          | Skip audio capture, disabling audio-reactive effects and beat matching. |
| `--no-midi`           | Skip MIDI, disabling controller input.                                  |

### Behavior worth knowing

- **The playlist comes from the project.** Whichever playlist was active when you
  exported is the one that runs; there is no flag for it. If none was set, the
  binary exits with an error rather than quietly running black.
- **It never writes to disk.** No autosave, no data directory, no writeback to
  the `.dmxapp`. MIDI bindings and beat-matched tempo still change the in-memory
  project — that is what makes them work — but those changes are gone on
  restart. Your show file is only ever an input.
- **Audio tracks and timecoded shows are not supported.** Audio embedded in the
  `.dmxapp` is dropped at load.
- **Ctrl-C and `SIGTERM` black out the rig** before the output loops stop, so a
  stopped service doesn't leave fixtures lit.
- **Visualizers need a working Vulkan driver.** On a Raspberry Pi that means
  Pi 4 or later — a Pi 3 has no Vulkan support, so pass `--no-visualizer` there
  to skip a GPU probe that can only fail. DMX output is unaffected either way,
  and a failed probe is logged rather than fatal.

### Running as a service

```ini
[Unit]
Description=DMX Controller App (headless)
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/dmx-controller-app-headless \
    --project /etc/dmx-controller/show.dmxapp \
    --mode autopilot \
    --no-visualizer
Restart=always
RestartSec=5
User=dmx
SupplementaryGroups=dialout audio

[Install]
WantedBy=multi-user.target
```

Create the `dmx` user with `sudo useradd --system --no-create-home dmx`. The
supplementary groups are only needed for optional hardware: `dialout` for
USB-DMX serial output, `audio` for microphone beat detection. sACN, WLED and DDP
output need neither, since they use ports above 1024.

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
