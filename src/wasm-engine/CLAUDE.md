# DEPRECATED - Do Not Use

This directory contains the **deprecated** browser-WASM engine bindings. This code is no longer maintained or built.

## Why This Is Deprecated

The browser-WASM approach has been removed due to:
- Limitations with Web Serial and Web MIDI APIs
- Inability to maintain reliable render loops at required frame rates
- The Tauri desktop application now handles all rendering and hardware I/O

## Instructions for Agents

**DO NOT:**
- Import from this directory or `@dmx-controller/wasm-engine`
- Use code patterns from this directory as precedent
- Attempt to build or run this code
- Reference this code when implementing new features

**The authoritative engine code is in:**
- `src-engine/` - Shared Rust rendering engine (used by Tauri)
- `src-tauri/` - Tauri backend with hardware I/O

## Historical Reference Only

This code is preserved for historical reference. If you need to understand how the WASM bindings worked, you may read this code, but do not use it as a template for new implementations.
