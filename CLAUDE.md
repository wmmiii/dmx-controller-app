# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build System & Commands

This project uses **Vite** as its primary build system for the frontend. Key commands:

- `pnpm run dev` - Start the development server (serves on https://localhost:8080)
- `pnpm run build` - Build the frontend for production
- `pnpm run preview` - Preview the production build
- `pnpm run test` - Run all tests
- `pnpm run type-check` - Run TypeScript type checking

**Development Workflow:**

- Vite provides fast HMR (Hot Module Replacement) for auto-rebuilds during development
- The dev server requires accepting a self-signed certificate (type "thisisunsafe" in Chrome if needed)
- Frontend TypeScript builds via Vite with CSS modules and SCSS support

## Architecture Overview

### Core Components

**Frontend (React/TypeScript)**

- Located in `editor/src/`
- Multi-page application with routing: Live performance (`LivePage`), Show editing (`ShowPage`), Patch configuration (`PatchPage`), Asset management (`AssetBrowserPage`)
- Uses React Context for state management across: Project, Serial/DMX, Beat detection, Controller input, Shortcuts

**Backend/Server (Go)**

- Development server in `dev/server/` serves static files and provides HTTPS endpoint
- Real DMX output requires custom ESP32 hardware (SparkFun ESP32 Thing Plus DMX Shield)

**Protocol Definitions**

- All data structures defined as Protocol Buffers in `proto/`
- Generated TypeScript bindings used throughout frontend
- Key types: Project, Universe, Effect, Scene, Show, DmxFixtureDefinition

### Data Flow & Engine

**DMX Universe Rendering Pipeline:**

1. `renderSceneToUniverse()` or `renderShowToUniverse()` in `engine/universe.ts` - core rendering entry points
2. Effects are applied to fixtures via the `RenderContext`
3. Color palettes provide dynamic color values that interpolate over time
4. Final 512-channel DMX universe array is output to hardware

**Project Structure:**

- **Scenes**: Live performance mode with tiles arranged in a grid, each tile contains effects or sequences
- **Shows**: Timeline-based editing mode with audio tracks and light tracks synchronized to beats
- **Fixtures**: DMX device definitions with channels (dimmer, color, pan/tilt, etc.)
- **Effects**: Static states, ramps, strobes, random effects that can be applied to fixtures/groups

**State Management:**

- `ProjectContext` handles project persistence, undo/redo stack (max 100 operations)
- Auto-saves to browser localStorage with binary protobuf serialization
- Assets (audio files, GDTF fixtures) stored separately in `Project_Assets`

### Key Files to Understand

**Engine Core:**

- `engine/universe.ts` - Main rendering pipeline and scene/show execution
- `engine/effect.ts` - Effect application logic
- `engine/fixture.ts` - DMX fixture abstractions and channel mapping
- `engine/group.ts` - Fixture grouping logic

**UI Pages:**

- `pages/LivePage.tsx` - Live performance interface with tile grid
- `pages/ShowPage.tsx` - Timeline-based show editor
- `pages/PatchPage.tsx` - Fixture patching and universe configuration

**External Hardware:**

- `external_controller/externalController.ts` - MIDI/controller input handling
- `contexts/SerialContext.tsx` - DMX output via Web Serial API

## Development Notes

**TypeScript Configuration:**

- Uses strict TypeScript with `tsconfig.json` in root
- React 19 with React Router for navigation
- SCSS modules for styling with shared variables in `_vars.scss`

**Protobuf Integration:**

- Generated types are imported with `@dmx-controller/proto/` namespace
- Use `.clone()` method for creating copies of protobuf objects
- Binary serialization via `.toBinary()` / `.fromBinary()` for persistence

**Hardware Integration:**

- DMX output requires Web Serial API (Chrome-based browsers only)
- External controllers (MIDI) supported via Web MIDI API
- Audio beat detection uses real-time BPM analyzer for tempo sync

**Effect System:**

- Effects have start/end times and can be static, ramp, strobe, or random
- Effects can target individual fixtures or groups
- Timing can be beat-synchronized or time-based
- Color palettes provide dynamic color sources that interpolate during transitions
