---
name: add-mcp-tool
description: Read BEFORE adding or editing an MCP tool that reads or (especially) mutates the project. Covers the common pitfalls one may run into when adding/updating MCP tools. Applies to src-tauri/src/mcp/ and any new #[tool].
---

# Adding MCP tools to this app

MCP tools (`src-tauri/src/mcp/`) expose engine logic to external agents that send **raw
input** and call tools **concurrently with the running app** — the frontend is writing the
same project the whole time (live MIDI faders fire `update()` continuously). Follow these
patterns.

## Structure: one app-wide server, tools grouped by domain

The server ([`AppMcp`](../../../src-tauri/src/mcp/mod.rs)) is scope-agnostic — it holds only
an `AppHandle`. Tools live in per-domain submodules, each an `impl AppMcp` annotated
`#[tool_router(router = <name>_router, vis = "pub(super)")]`; `AppMcp::server_router` sums the
group routers. To add a domain, add a `#[tool]` to an existing group's module or create a new
`mcp/<domain>.rs` group and `+` its router into `server_router`. `mcp/visualizer.rs` is the
reference group; `mcp/utils.rs` holds cross-group helpers like `ai_save`.

For work only the webview can do (its WebGL2 pipeline, DOM/canvas, browser-side APIs),
round-trip to the frontend with `bridge::request(app, kind, payload).await` — the webview
services it in `src/system_interfaces/mcpVisualizerBridge.ts` and replies via the
`mcp_frontend_response` command. It times out if the app is closed. `compile_visualizer` is
the reference: it checks GLSL in the engine (naga) directly and via the browser bridge, and
treats an unreachable webview as "unchecked" rather than a failure. Prefer doing work in the
engine directly when you can — `preview_visualizer` renders via the wgpu engine, no bridge.

## Route every project mutation through `ai_save`

Use [`mcp::utils::ai_save`](../../../src-tauri/src/mcp/utils.rs):

```rust
utils::ai_save(&self.app, &format!("Save visualizer \"{name}\""), move |p| {
    p.visualizers.insert(id, visualizer);
    Ok(())
})
.await?;
```

It does everything a mutating tool needs, in the right order:

- Mutates under a single `PROJECT_STATE` lock (via
  [`project::save`](../../../src-engine/src/project.rs)), so the whole read-modify-write is
  atomic and no concurrent writer can interleave and clobber it.
- Records **one** `AI:`-prefixed entry on the **shared** undo stack, so the user can Ctrl-Z
  the agent's work like any other edit.
- Runs the finalize pipeline (emit → debounced persist → rebuild outputs).

`upsert_visualizer` / `delete_visualizer` in
[`visualizer.rs`](../../../src-tauri/src/mcp/visualizer.rs) are the reference usage.

**Call `ai_save` once per state-modifying tool.** Do all of the tool's mutation inside its
single closure, so each tool invocation is one atomic, undoable operation — don't chain
multiple `ai_save` calls within one tool.

> Engine primitives, for reference: `project::save(description, undoable, f)` is the atomic
> write; `save_snapshot(binary, …)` is the frontend's whole-binary variant. Tools go through
> `ai_save`, not these directly.

## Push whole-project consistency logic into `src-engine`, share via WASM

The project protobuf is full of cross-references (effects hold `visualizerIds`, outputs hold
target ids, scenes/playlists/shows point at shared objects). The logic that keeps them
consistent often lives in **frontend TypeScript**, which a Rust-side MCP edit bypasses.

So for any operation beyond a self-contained field write — **delete, reorder, re-id,
rename-that-others-reference** — put the whole-project crawl in `src-engine` as one function
and call it from both sides: the MCP tool directly, and the frontend through the WASM engine
(`src/wasm-engine/` → `src/wasm/engine.ts`; see that crate's CLAUDE.md and
`active_playlist_selection` for the `_from_parts` pattern). One implementation, one set of
invariants.

## Validate raw agent input at the boundary

Agent input isn't shaped by the typed UI, so re-check what the UI would have guaranteed: ids
exist and are the right kind (user vs built-in), GLSL / strings compile, referenced objects
are present, and **a project is actually open** (`with_project` yields a default empty
project when none is loaded).

## Reach for managed state with `try_state`

`app.state::<T>()` panics if the type isn't managed yet, and the MCP server spawns during
`setup()` — use `try_state` and return an error instead.

## Checklist for a new tool

- [ ] State-modifying tool calls `ai_save` exactly once, doing all its mutation in the one
      closure (atomic, shared `AI:`-prefixed undo).
- [ ] Delete/reorder/re-id/rename call a shared `src-engine` consistency crawl, shared with
      the frontend via WASM.
- [ ] Raw params validated (ids exist & correct kind, source compiles, a project is open)
      through the same logic on the frontend and backend.
- [ ] Managed state accessed via `try_state`.
- [ ] `cargo check -p dmx_controller_app` (or `-p dmx-engine`) passes. Don't run full
      build/clippy/lint to "finalize" — the user runs those.
