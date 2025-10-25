fn main() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let project_root = std::path::Path::new(&manifest_dir).join("..");
    let proto_dir = project_root.join("proto");

    // Automatically discover all .proto files
    let proto_files: Vec<_> = std::fs::read_dir(&proto_dir)
        .expect("Failed to read proto directory")
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.extension()? == "proto" {
                // Return full absolute path
                Some(path.to_str()?.to_string())
            } else {
                None
            }
        })
        .collect();

    let proto_path_refs: Vec<&str> = proto_files.iter().map(|s| s.as_str()).collect();

    // Compile all proto files with include path set to project root
    prost_build::Config::new()
        .extern_path(".dmx_controller.timecoded", "crate::proto::timecoded")
        .compile_protos(&proto_path_refs, &[project_root.to_str().unwrap()])
        .expect("Failed to compile protos");
}
