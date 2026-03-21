# WASM Removal Migration Plan

> **IMPORTANT FOR AGENTS**: This is a living document. Update the checkboxes and add notes as you complete work. Add any blockers, questions, or discoveries in the appropriate sections. When you complete a task, mark it with `[x]` and add a brief note about what was done.

## Overview

This document tracks the removal of the browser-WASM approach from the DMX controller application. The application currently supports two modes:

1. **Browser/WASM Mode** (being removed): Runs entirely in the browser using WebAssembly for rendering, with Web Serial/MIDI APIs for hardware access
2. **Tauri/Local Binary Mode** (keeping): Desktop application with Rust backend handling rendering and hardware I/O

The browser-WASM approach is no longer feasible due to limitations with Web APIs and the inability to maintain reliable render loops at the required frame rates.

---

## Current Architecture Summary

### Key Directories

| Directory                | Purpose                                                | Fate                       |
| ------------------------ | ------------------------------------------------------ | -------------------------- |
| `src/wasm-engine/`       | WASM bindings wrapping `src-engine`                    | **DELETE**                 |
| `src-engine/`            | Shared Rust rendering engine                           | **KEEP** (Tauri uses this) |
| `src-tauri/`             | Tauri backend with hardware I/O                        | **KEEP**                   |
| `src/system_interfaces/` | Frontend abstraction layer with `isTauri` multiplexing | **SIMPLIFY**               |
| `pkg/`                   | WASM build output directory                            | **DELETE**                 |

### Multiplexing Pattern

The frontend uses an `isTauri` flag to switch between implementations:

```typescript
// src/system_interfaces/engine.ts
export const isTauri = (window as any).__TAURI__ != null;
export const updateProject = isTauri ? tauriUpdateProject : webUpdateProject;
export const renderDmx = isTauri ? tauriRenderDmx : webRenderDmx;
// ... etc
```

This pattern exists in:

- `src/system_interfaces/engine.ts` - Rendering functions
- `src/system_interfaces/serial.ts` - Serial port I/O
- `src/system_interfaces/output_loop.ts` - Render loop control
- `src/system_interfaces/midi.ts` - MIDI device handling
- Various React contexts

---

## Phase 1: GitHub Pages Replacement

**Goal**: Create an alternative page to host via GitHub Pages that explains the project and directs users to download the desktop app.

### Tasks

- [x] **1.1** Create a static landing page in a new directory (e.g., `landing/` or `gh-pages/`)
  - Should explain what the DMX controller is
  - Link to releases/downloads for the desktop app
  - Include screenshots or demo content if available
  - Notes: Created `web/` directory with landing page. Includes app description with supported protocols (Serial DMX, sACN, WLED), 512-channel universes, GDTF support, beat detection, MIDI control. Added 5-step "Getting Started" guide for running a live show. Uses shared CSS variables via `pnpm run css-vars:build` (generated from `src/_vars.scss`). Icon symlinked. Footer includes "Made with ❤️ by Will Martin" and "free forever" note. Updated CLAUDE.md with instructions for agents to keep website copy consistent.

- [x] **1.2** Update `.github/workflows/deploy.yaml` to deploy the landing page instead of the full app
  - Change the build step to build/copy the landing page
  - Update artifact upload path
  - Notes: Workflow now deploys `web/` directory. Added symlink resolution for `icon.png` (in addition to existing `vars.css`). Added cache-busting via git SHA query strings on CSS and asset links to prevent stale cached assets from old Vite deployment.

- [x] **1.3** Consider adding a redirect or message for users who visit the old app URL
  - Notes: The landing page at the same URL now explains the desktop app and provides download links. Cache-busting ensures returning users see the new content rather than cached WASM app.

### Considerations

- The current GitHub Pages URL is likely `https://wmmiii.github.io/dmx-controller-app/` or similar
- Users may have bookmarked the old URL
- The landing page should be simple HTML/CSS (no React build required)

### Files to Modify

- `.github/workflows/deploy.yaml`
- Create new: `web/index.html`, `web/style.css` (created)

---

## Phase 2: Remove WASM Engine Code

**Goal**: Delete the WASM engine crate and all related build infrastructure.

### Tasks

- [ ] **2.1** Delete `src/wasm-engine/` directory entirely
  - This contains `Cargo.toml`, `src/lib.rs`, and WASM bindings
  - Notes: _Agent should add notes here_

- [ ] **2.2** Delete `pkg/` directory (WASM build output)
  - May be gitignored but verify
  - Notes: _Agent should add notes here_

- [ ] **2.3** Remove WASM build step from `package.json`
  - Remove: `"wasm:build": "cd src/wasm-engine && wasm-pack build --target web --out-dir ../../pkg"`
  - Update `"build"` script to remove `pnpm run wasm:build` step
  - Notes: _Agent should add notes here_

- [ ] **2.4** Remove WASM import alias from `vite.config.ts`
  - Remove: `'@dmx-controller/wasm-engine'` alias pointing to `./pkg`
  - Notes: _Agent should add notes here_

- [ ] **2.5** Update root `Cargo.toml` workspace members (if applicable)
  - Remove `wasm-engine` from workspace members list
  - Notes: _Agent should add notes here_

- [ ] **2.6** Remove any WASM-related dependencies from root project
  - Check for `wasm-pack` in dev dependencies or tooling
  - Notes: _Agent should add notes here_

### Considerations

- The `src-engine/` crate should remain untouched - it's shared with Tauri
- The `getrandom` crate in `src-engine` has a `wasm_js` feature that may no longer be needed after this change, but leave it for now to avoid breaking Tauri

### Files to Delete

- `src/wasm-engine/` (entire directory)
- `pkg/` (entire directory, if exists)

### Files to Modify

- `package.json`
- `vite.config.ts`
- Root `Cargo.toml` (if it has workspace config)

---

## Phase 3: Clean Up Frontend Multiplexing

**Goal**: Remove the `isTauri` conditional logic and web-specific implementations from the frontend.

### Tasks

- [ ] **3.1** Simplify `src/system_interfaces/engine.ts`
  - Remove `isTauri` check
  - Remove all `webXxx` functions (they call WASM)
  - Keep only Tauri implementations
  - Remove WASM imports: `import { init, init_engine, ... } from '@dmx-controller/wasm-engine'`
  - Notes: _Agent should add notes here_

- [ ] **3.2** Simplify `src/system_interfaces/serial.ts`
  - Remove web-specific serial port handling (Web Serial API code)
  - Keep only Tauri invoke calls
  - Notes: _Agent should add notes here_

- [ ] **3.3** Simplify `src/system_interfaces/output_loop.ts`
  - Remove `outputLoopSupported` check (always true now)
  - Remove web no-op implementations
  - Notes: _Agent should add notes here_

- [ ] **3.4** Simplify `src/system_interfaces/midi.ts`
  - Remove Web MIDI API fallback code
  - Keep only Tauri invoke calls
  - Notes: _Agent should add notes here_

- [ ] **3.5** Update React contexts that have `isTauri` checks
  - `src/contexts/SerialContext.tsx`
  - `src/contexts/SacnRendererContext.tsx` (if exists)
  - `src/contexts/WledRendererContext.tsx` (if exists)
  - Remove web-specific rendering loops
  - Notes: _Agent should add notes here_

- [ ] **3.6** Clean up `src/system_interfaces/renderRouter.ts`
  - Remove web-specific subscription logic
  - Keep Tauri event subscriptions
  - Notes: _Agent should add notes here_

- [ ] **3.7** Search for and remove any remaining `isTauri` references
  - Run: `grep -r "isTauri" src/`
  - Notes: _Agent should add notes here_

- [ ] **3.8** Remove any web-specific initialization code
  - Look for WASM `init()` calls
  - Look for `init_engine()` calls
  - Notes: _Agent should add notes here_

### Considerations

- After this phase, the app will ONLY work as a Tauri desktop app
- Test thoroughly after each file change
- The `@tauri-apps/api` imports should remain

### Key Patterns to Remove

```typescript
// REMOVE this pattern everywhere:
export const isTauri = (window as any).__TAURI__ != null;
export const someFunction = isTauri ? tauriImpl : webImpl;

// REPLACE with:
export const someFunction = tauriImpl;
```

### Files to Modify

- `src/system_interfaces/engine.ts`
- `src/system_interfaces/serial.ts`
- `src/system_interfaces/output_loop.ts`
- `src/system_interfaces/midi.ts`
- `src/system_interfaces/renderRouter.ts`
- Various context files in `src/contexts/`

---

## Phase 4: Evaluate Rust Server Opportunities

**Goal**: Identify functionality that can be moved from the frontend to the Rust backend now that we're Tauri-only.

### Tasks

- [ ] **4.1** Audit current frontend responsibilities
  - List what the frontend currently does that could be backend work
  - Notes: _Agent should add notes here_

- [ ] **4.2** Evaluate moving project persistence to Rust
  - Currently uses browser localStorage with protobuf serialization
  - Could use filesystem storage instead
  - Notes: _Agent should add notes here_

- [ ] **4.3** Evaluate moving asset management to Rust
  - Audio files, GDTF fixtures currently in browser storage
  - Could use proper filesystem with better capacity
  - Notes: _Agent should add notes here_

- [ ] **4.4** Evaluate beat detection
  - Currently runs in JavaScript
  - Could be more performant in Rust
  - Notes: _Agent should add notes here_

- [ ] **4.5** Evaluate controller input handling
  - External controller/MIDI handling
  - Already partially in Rust, may be able to consolidate
  - Notes: _Agent should add notes here_

- [ ] **4.6** Document recommendations
  - Create prioritized list of what should move to Rust
  - Consider complexity vs. benefit tradeoffs
  - Notes: _Agent should add notes here_

### Considerations

- Don't over-engineer - only move things that provide clear benefits
- Benefits might include: better performance, simpler code, better file system access
- Some things may be better left in the frontend (UI state, etc.)

### Potential Candidates for Migration

| Feature           | Current Location        | Benefit of Moving                  |
| ----------------- | ----------------------- | ---------------------------------- |
| Project save/load | Frontend (localStorage) | Proper filesystem, larger projects |
| Asset storage     | Frontend (IndexedDB)    | Better file management             |
| Beat detection    | Frontend (JS)           | Lower latency, more accurate       |
| MIDI processing   | Split                   | Consolidation                      |

---

## Phase 5: Final Cleanup and Testing

**Goal**: Ensure everything works correctly and clean up any remaining artifacts.

### Tasks

- [ ] **5.1** Run full build and verify no errors
  - `pnpm run build`
  - Notes: _Agent should add notes here_

- [ ] **5.2** Run type checking
  - `pnpm run type-check`
  - Notes: _Agent should add notes here_

- [ ] **5.3** Run tests
  - `pnpm run test`
  - Notes: _Agent should add notes here_

- [ ] **5.4** Test Tauri development build
  - `pnpm tauri dev` (or equivalent)
  - Notes: _Agent should add notes here_

- [ ] **5.5** Test all major features
  - Live page rendering
  - Show playback
  - Fixture patching
  - Serial DMX output
  - sACN output
  - WLED output
  - MIDI input
  - Notes: _Agent should add notes here_

- [ ] **5.6** Update documentation
  - Update `CLAUDE.md` to reflect new architecture
  - Remove references to browser/WASM mode
  - Notes: _Agent should add notes here_

- [ ] **5.7** Update CI pipeline
  - `.github/workflows/ci.yaml` may need updates
  - Remove WASM-related build steps
  - Notes: _Agent should add notes here_

---

## Dependency Graph

```
Phase 1 (GitHub Pages)     Phase 2 (Remove WASM)
         \                      /
          \                    /
           v                  v
           Phase 3 (Clean up multiplexing)
                    |
                    v
           Phase 4 (Evaluate Rust opportunities)
                    |
                    v
           Phase 5 (Final cleanup)
```

Phases 1 and 2 can be done in parallel. Phase 3 depends on Phase 2. Phase 4 can start during Phase 3. Phase 5 should be last.

---

## Known Risks and Mitigations

| Risk                    | Impact | Mitigation                                             |
| ----------------------- | ------ | ------------------------------------------------------ |
| Breaking Tauri build    | High   | Run `pnpm run build` and `pnpm tauri build` frequently |
| Missing WASM references | Medium | Use grep to find all references before removing        |
| Lost functionality      | High   | Document what web mode did that Tauri mode doesn't     |
| CI/CD breakage          | Medium | Test deployment workflow in a branch first             |

---

## Questions/Blockers

_Agents should add questions or blockers here as they encounter them_

- ***

## Completion Log

_Agents should log major completions here with dates_

| Date       | Phase | Task     | Agent  | Notes                                                                                                              |
| ---------- | ----- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| 2026-03-21 | 1     | 1.1      | Claude | Created `web/` directory with landing page, shared CSS vars build system, Getting Started guide, updated CLAUDE.md |
| 2026-03-21 | 1     | 1.2, 1.3 | Claude | Fixed deploy workflow: resolved icon.png symlink, added cache-busting with git SHA for all assets                  |

---

## References

- `src-engine/src/lib.rs` - Core engine API
- `src-tauri/src/lib.rs` - Tauri command handlers
- `src/system_interfaces/` - Frontend abstraction layer
- `.github/workflows/` - CI/CD configuration
