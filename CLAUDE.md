# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build System & Commands

This project uses **Vite** as its primary build system for the frontend. Key commands:

- `pnpm run dev` - Generate protos and start the development server (serves on https://localhost:8080)
- `pnpm run build` - Generate protos and build the frontend for production
- `pnpm run preview` - Preview the production build
- `pnpm run test` - Run all tests (Jest + Rust cargo tests)
- `pnpm run type-check` - Run TypeScript type checking
- `pnpm run proto:generate` - Regenerate TypeScript bindings from .proto files (via buf)
- `pnpm run format` - Auto-format all code with Prettier
- `pnpm run lint` - Run all linters (ESLint, Knip dead code detection, Clippy)
- `pnpm run cleanup` - Run linters then format (use this when finalizing changes)
- `pnpm run tauri` - Build/run the Tauri desktop app
- `pnpm run tauri:dev` - Run Tauri in development mode with backtrace enabled
- `pnpm run tauri:ios` - Run iOS simulator (iPad Pro 13-inch M5)

**Development Workflow:**

- Vite provides fast HMR (Hot Module Replacement) for auto-rebuilds during development
- Frontend TypeScript builds via Vite with CSS modules

## Architecture Overview

### Core Components

**Frontend (React/TypeScript)**

- Located in `src/`
- Multi-page application with routing: Live performance (`LivePage`), Show editing (`ShowPage`), Patch configuration (`PatchPage`), Asset management (`AssetBrowserPage`), Controller configuration (`ControllerPage`), Project management (`ProjectPage`)
- Note: Show and Assets pages are currently disabled in the main menu UI (commented out in [src/Index.tsx:107-114](src/Index.tsx#L107-L114))
- Uses React Context for state management across: Project, Serial/DMX, Beat detection, Controller input, Shortcuts, Dialog, Palette, Effect rendering

**Rendering Engine (Rust)**

- Core rendering library in `src-engine/` (Rust) — handles DMX universe rendering, effects, scenes, output targets
- Tauri desktop builds use the native Rust engine directly via `src-tauri/`
- **Deprecated:** `src/wasm-engine/` — browser WASM bindings are no longer maintained; do not import from or reference this directory

**Desktop App (Tauri)**

- `src-tauri/` wraps the frontend as a native desktop app
- Provides native MIDI, Serial DMX, sACN/E1.31, and WLED output via platform APIs
- Development server in `dev/server/` serves static files and provides HTTPS for the frontend dev server

**Protocol Definitions**

- All data structures defined as Protocol Buffers in `proto/`
- Generated TypeScript bindings used throughout frontend (regenerated with `pnpm run proto:generate`)
- Key types: Project, Universe, Effect, Scene, Show, DmxFixtureDefinition

### Data Flow & Engine

**DMX Universe Rendering Pipeline:**

- Rust engine (`src-engine/src/render/`) handles all rendering; `src/engine/renderRouter.ts` is the TypeScript entry point into the native Tauri engine
- Effects are applied to fixtures via the `RenderContext`; color palettes interpolate over time to provide dynamic color values
- Final 512-channel DMX universe array is output via Serial, sACN/E1.31, or WLED

**Project Structure:**

- **Scenes**: Live performance mode with tiles arranged in a grid, each tile contains effects or sequences
- **Shows**: Timeline-based editing mode with audio tracks and light tracks synchronized to beats
- **Fixtures**: DMX device definitions with channels (dimmer, color, pan/tilt, etc.)
- **Effects**: Static states, ramps, strobes, random effects that can be applied to fixtures/groups

**State Management:**

- `ProjectContext` handles project persistence, undo/redo stack (max 100 operations)
- Auto-saves to file system with binary protobuf serialization
- Assets (audio files, GDTF fixtures) stored separately in `Project_Assets`

### Key Files to Understand

**Engine Core (Rust):**

- `src-engine/src/render/render.rs` - Main render loop
- `src-engine/src/render/scene.rs` - Scene rendering
- `src-engine/src/render/dmx_render_target.rs` - DMX output target
- `src-engine/src/render/wled_render_target.rs` - WLED output target
- Effect renderers: `ramp_effect.rs`, `random_effect.rs`, `sequence_effect.rs`, `strobe_effect.rs`, `preset_effect.rs`

**Engine (TypeScript — browser glue):**

- `src/engine/renderRouter.ts` - Routes render calls to the native Tauri engine
- `src/engine/channel.ts` - DMX channel abstractions
- `src/engine/group.ts` - Fixture grouping logic
- `src/engine/fixtures/fixture.ts` - Fixture abstractions and channel mapping
- `src/engine/fixtures/dmxDevices.ts` - Built-in DMX device definitions

**System Interfaces:**

- `src/system_interfaces/` - Abstractions over browser vs. native (Tauri) APIs for engine, MIDI, project, serial, and WLED

**UI Pages (all in `src/pages/`):**

- `LivePage.tsx` - Live performance interface with tile grid
- `ShowPage.tsx` - Timeline-based show editor
- `patch/PatchPage.tsx` - Fixture patching and universe configuration
- `ControllerPage.tsx` - MIDI/controller configuration
- `ProjectPage.tsx` - Project management
- `AssetBrowserPage.tsx` - Audio and GDTF fixture asset management

**External Hardware:**

- `src/external_controller/externalController.ts` - Controller binding lookup and management (action processing is handled in Rust via `src-tauri/src/midi.rs`)
- `src/contexts/SerialContext.tsx` - DMX output via Web Serial API (browser)
- `src-tauri/src/serial.rs` - Native Serial DMX output (desktop)
- `src-tauri/src/sacn.rs` - sACN/E1.31 output
- `src-tauri/src/wled.rs` - WLED output

## Development Notes

**TypeScript Configuration:**

- Uses strict TypeScript with `tsconfig.json` in root
- React 19.2.4 with React Router 7 for navigation
- React Compiler enabled via `babel-plugin-react-compiler` for automatic optimization
- Radix UI Themes for component library and dialogs
- CSS modules for styling with shared variables in `src/vars.css`
- Path aliases: `@dmx-controller/proto/*` for generated protobuf types
- **Deprecated alias:** `@dmx-controller/wasm-engine` — do not use; WASM engine has been removed

**Protobuf Integration:**

- Generated types are imported with `@dmx-controller/proto/` namespace
- Use `.clone()` method for creating copies of protobuf objects
- Binary serialization via `.toBinary()` / `.fromBinary()` for persistence

**Hardware Integration:**

- Desktop mode (Tauri): native Serial, MIDI, sACN, and WLED output
- Manual BPM and first beat configuration for precise beat synchronization
- Tap tempo for manual BPM sync
- Keepawake plugin prevents system sleep during performances

**Effect System:**

- Effects have start/end times and can be static, ramp, strobe, random, sequence, or preset
- **Preset effects** include:
  - Rainbow Effect: HSV-based rainbow color cycle across fixtures
  - Circle Effect: Circular pan/tilt movements with configurable min/max ranges
- Effects can target individual fixtures or groups
- Timing can be beat-synchronized or time-based
- Color palettes provide dynamic color sources that interpolate during transitions

## Code Style

**Minimize Visibility and Mutability:**

When writing or modifying code, prefer the most restrictive access level and avoid unnecessary mutability:

_TypeScript:_

- Use `private` for fields and methods not needed outside the class (prefer `private` over `#private`)
- Use `readonly` for fields that should not be reassigned after initialization
- Only export functions, classes, and types that are part of the module's public API

_Rust:_

- Keep items private by default; only add `pub`, `pub(crate)`, or `pub(super)` when needed
- Prefer immutable bindings (`let`) over mutable (`let mut`) unless mutation is required

This guidance applies only to code you are actively modifying—do not refactor unrelated code to adjust visibility. Run `pnpm run test` after changes to verify visibility restrictions didn't break anything.

## Efficient Agent Workflows

**Prefer bulk reads over many small reads:**

- Read entire files or large sections in one operation rather than making many small reads
- When exploring unfamiliar code, read whole files rather than hunting line by line
- Write complete file contents in one Write operation rather than many small Edits

**Use CLI tools instead of manual code manipulation:**

- Prefer `sed`, `pnpm`, and other shell tools for repetitive or mechanical changes rather than AI-guessing edits
- Examples: `sed -i 's/oldName/newName/g' file.ts` for renames, `pnpm run format` to fix formatting, `pnpm run proto:generate` after proto changes
- Ask the user to allowlist specific tools as needed rather than doing everything manually

**Batch independent tool calls:**

- When making multiple independent changes (e.g., editing several files, running parallel commands), batch them into a single message with multiple tool calls
- Do not make sequential tool calls that could be parallelized — this wastes time and tokens
- Example: editing three Cargo.toml files should be three Edit calls in one message, not three separate messages

**Finalize changes with cleanup:**

- Before completing a task, run `pnpm run cleanup` to catch dead code, deprecated usage, and formatting issues
- Fix any issues found before marking the task complete

## Website & Documentation

The `web/` directory contains a static landing page deployed to GitHub Pages. When making changes that affect user-facing features, supported protocols, or workflows:

- **Review `web/index.html`** to ensure the landing page copy remains accurate
- Update the "Getting Started" steps if the workflow changes
- Update protocol/feature descriptions if capabilities are added or removed
- The landing page describes: Serial DMX, sACN/E1.31, WLED outputs; GDTF fixture support; tap tempo; MIDI control

The landing page uses shared CSS variables from `src/vars.css` (symlinked to `public/vars.css`).
