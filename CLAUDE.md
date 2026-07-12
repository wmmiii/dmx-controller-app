# CLAUDE.md

Guidance for Claude Code when working in this repository. Keep this file lean: broad architecture and behavior that can't be inferred from the code, not a file catalog. If you're tempted to add a paragraph explaining how something works, prefer a one-line pointer to where it lives — implementation detail belongs in the code (doc comments), not here. Docs can lag the code; when a task hinges on a specific detail, verify against source rather than trusting this file's prose.

## Stack

React 19 + TypeScript frontend (`src/`, built with Vite), wrapped as a native desktop app via Tauri (`src-tauri/`). A shared Rust rendering engine (`src-engine/`) handles DMX/effect/scene rendering and is used directly by the Tauri build; a separate minimal crate (`src/wasm-engine/`, excluded from the Cargo workspace, built via `wasm-pack`) compiles a subset of that same logic to WASM so the frontend can do beat-timing and waveform math without an IPC round-trip — see its own CLAUDE.md. All data structures are Protocol Buffers under `proto/`; regenerate TS bindings with `pnpm run proto:generate` after any `.proto` edit. Proto files are the authoritative source for the data model/capabilities — prefer them over prose here when they disagree.

**The app only runs inside the Tauri webview.** `src/system_interfaces/` is a thin Tauri IPC binding layer (`invoke`/`listen`) with no browser fallback — nothing past the initial paint (project load/save, MIDI, DMX/WLED/DDP output, the Visualizer) works outside Tauri. `pnpm run tauri:dev` is the only supported way to run or test the app.

**Output types are not structurally uniform.** Serial and sACN/E1.31 share a classic 512-channel DMX byte array. WLED gets its own segment/effect state (WLED's onboard engine renders the pixels — no per-pixel data is sent). DDP isn't part of the fixture/effect system at all — it only receives raw per-pixel data from virtual displays via the Visualizer's display pipeline. Don't assume a shared "universe" across output types; see `src-engine/src/render/`.

**Feature maturity isn't obvious from the routes.** `TimecodedShowPage` is an unimplemented stub (`timecoded.proto` exists, nothing consumes it yet). The Audio Tracks subsystem (`AssetBrowserPage`, import/playback/waveform/beat-tagging) is fully functional but its nav entry is commented out in `src/Index.tsx` — check that file's `menuItems`, not just the route table, before assuming a page is reachable.

## Where things live

- `src-engine/src/render/` — Rust rendering engine (shared by desktop + WASM)
- `src-tauri/src/` — native platform integration: MIDI, Serial, sACN, WLED, DDP, audio capture, wgpu-based Visualizer shaders
- `src/engine/` — TypeScript glue that routes render calls into the native engine
- `src/system_interfaces/` — Tauri IPC bindings (see above)
- `src/pages/` — one file/folder per top-level route (routing + nav lives in `src/Index.tsx`)
- `src/contexts/` — one React Context per cross-cutting concern (project, controller, beat, audio input, shortcuts, palette, clipboard, effect-timeline rendering)
- `src/audio/` — audio track playback and waveform analysis

## Build & Commands

- `pnpm run tauri:dev` - Run the app (the only supported way to develop/test it)
- `pnpm run build` - Generate protos, build the WASM engine, build the frontend for production
- `pnpm run test` - Jest + Rust `cargo test` (src-engine and src-tauri)
- `pnpm run type-check` / `pnpm run lint` / `pnpm run cleanup` - see Agent Workflow below before running these
- `pnpm run proto:generate` - Regenerate TS bindings from `.proto` files; needed after any proto edit before the new types are usable
- `pnpm run tauri:ios` - iOS simulator

`pnpm run dev` exists only because Tauri's `beforeDevCommand` shells out to it to boot the Vite dev server before wrapping it in the native webview — don't run it standalone, it won't produce a working app.

CI/CD lives in `.github/workflows/`: `ci.yaml` is the PR gate, `deploy.yaml` deploys `web/` to GitHub Pages, `release.yml` builds Tauri binaries — gated on an actual version bump in `src-tauri/tauri.conf.json`, not just any merge to `main`.

## Code Style

**Prefer self-documenting code over comments:**

- Write clear, descriptive names for functions, variables, and types that convey intent
- Only add comments when the code cannot reasonably explain itself (non-obvious algorithms, workarounds, external constraints)
- Don't add comments that restate what the code already expresses
- Avoid docstrings/JSDoc/Rust doc comments unless they add information not evident from the signature and implementation

**Minimize visibility and mutability** (for code you're actively touching — don't refactor unrelated code just to tighten this):

- TypeScript: prefer `private` over `#private`, `readonly` where fields aren't reassigned, only export what's part of a module's public API
- Rust: private by default, only add `pub`/`pub(crate)`/`pub(super)` when needed; prefer `let` over `let mut`

**React:** the React Compiler (`babel-plugin-react-compiler`) handles memoization automatically — don't manually add `useMemo`/`useCallback`/`React.memo`, it's redundant and against project convention. Component library is Base UI (`@base-ui/react`, wrapped under `src/components/`); styling is CSS modules with shared variables in `src/vars.css` — don't reach for a different UI kit or global CSS.

**Protobuf:** use `.clone()` to copy proto objects; `.toBinary()`/`.fromBinary()` for persistence — these are protobuf-es conventions, not arbitrary choices.

## Agent Workflow

- **Bulk reads over many small ones.** Read whole files/sections rather than hunting line by line; write complete file contents in one `Write` rather than many small `Edit`s.
- **CLI tools over manual edits** for mechanical changes (`sed` for renames, `pnpm run proto:generate` after proto changes) rather than hand-editing every occurrence.
- **Docs over source** when learning a third-party library's API (Base UI, Tauri plugins, wgpu, buf/protobuf-es) — reading source to reverse-engineer usage burns context the library's own docs already spell out. Reserve source-reading for this repo's own code.
- **Batch independent tool calls** into one message rather than making sequential calls that could run in parallel.
- **Avoid searching generated/vendored trees** (`target/`, `node_modules/`, `proto/generated/`, `dist/`) — large, slow, and rarely relevant; most already match `.gitignore` but plain `grep -r`/`find` don't respect that automatically.
- **Don't run formatting/linting/build commands proactively.** Never run `pnpm run cleanup`, `format`, `lint`, `build`, or `cargo clippy` to "finalize" a change or fix style output — the user runs these themselves. Use the narrowest check that answers the actual question (`cargo check -p <crate>` over a full build, one Jest file over the whole suite) and reach for the full `pnpm run test`/`build` only when nothing narrower can answer it. Fix real errors you hit along the way; don't go hunting for lint warnings.
- **Ask before guessing when genuinely ambiguous** — UI/UX decisions, proto/schema shape, effect/fixture behavior, anything where a wrong guess means rework. Proceed without asking on mechanical or clearly-implied decisions.
- **Persistent memory (`~/.claude/projects/.../memory/`) is local to this machine and this working-directory path** — it doesn't travel with `git clone` and won't exist on a fresh checkout elsewhere. Anything that should hold regardless of machine belongs in this file, not memory alone.

## Website Sync

`web/` is a static landing page auto-deployed to GitHub Pages on push to `main`. When a change affects user-facing features, supported protocols, or the onboarding flow, update `web/index.html` to match — it currently describes Serial/sACN/WLED/DDP output, the Visualizer, GDTF import, tap tempo, and MIDI control. It shares CSS variables with `src/vars.css` (symlinked to `public/vars.css`).
