pub mod midi;
pub mod project;
pub mod proto;
pub mod render;
pub mod tile;

pub fn hello_from_rust(name: &str) -> String {
    format!("Hello from Rust, {}! The DMX engine is running.", name)
}

pub fn init_engine() {
    // Future initialization logic will go here
}

pub fn process_project(project: &proto::Project) -> Result<String, String> {
    Ok(format!("Successfully received project: {}", project.name))
}
