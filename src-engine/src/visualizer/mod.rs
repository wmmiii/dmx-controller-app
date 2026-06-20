//! Shareable visualizer logic: pure data structures, GLSL source strings and
//! string manipulation with no GPU calls. GPU-specific rendering lives in
//! `src-tauri/src/shader.rs` (wgpu). Keeping this logic here lets a future
//! WebGL preview in the browser reuse the same tree building, shader wrapping
//! and built-in sources.

pub mod builtin;
pub mod shader_wrap;
pub mod tree;
pub mod uniforms;
