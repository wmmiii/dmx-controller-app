use std::fs;
use std::path::PathBuf;

fn main() {
    let config_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.join("src-tauri/tauri.conf.json"))
        .expect("Cannot determine project root");

    let config_str = fs::read_to_string(&config_path).expect("Failed to read tauri.conf.json");

    let config: serde_json::Value =
        serde_json::from_str(&config_str).expect("Failed to parse tauri.conf.json");

    let version = config
        .get("version")
        .and_then(|v| v.as_str())
        .expect("No version field in tauri.conf.json");

    println!("cargo:rustc-env=DMX_CONTROLLER_APP_VERSION={version}");
}
