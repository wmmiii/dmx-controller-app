// Include the generated proto definitions from the build script
include!(concat!(env!("OUT_DIR"), "/dmx_controller.rs"));

// Re-export the timecoded module
pub mod timecoded {
    include!(concat!(env!("OUT_DIR"), "/dmx_controller.timecoded.rs"));
}
