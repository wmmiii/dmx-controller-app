// Include the generated proto definitions from the build script
// Suppress clippy warnings on generated protobuf code
#![allow(clippy::doc_markdown, clippy::must_use_candidate)]

include!(concat!(env!("OUT_DIR"), "/dmx_controller.rs"));
