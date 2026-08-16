use serde_json::Value;
use std::env;
use std::path::PathBuf;

fn main() {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let tauri_config_path = PathBuf::from(&manifest_dir)
        .parent()
        .unwrap()
        .join("src-tauri/tauri.conf.json");

    let config_content =
        std::fs::read_to_string(&tauri_config_path).expect("Failed to read tauri.conf.json");

    let config: Value =
        serde_json::from_str(&config_content).expect("Failed to parse tauri.conf.json");

    let version = config["version"]
        .as_str()
        .expect("Failed to extract version from tauri.conf.json");

    println!("cargo:rustc-env=DMX_CONTROLLER_APP_VERSION={version}");
}
