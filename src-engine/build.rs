fn get_protoc_binary_name() -> &'static str {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "protoc-win64.exe"
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "protoc-linux-x86_64"
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        "protoc-linux-aarch_64"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "protoc-osx-x86_64"
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "protoc-osx-aarch_64"
    }
}

fn main() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let project_root = std::path::Path::new(&manifest_dir).join("..");
    let proto_dir = project_root.join("proto");

    // Use protoc from node_modules (installed via pnpm) if PROTOC is not already set
    if std::env::var("PROTOC").is_err() {
        // Point directly to the platform-specific binary, not the shell wrapper
        let protoc_bin = get_protoc_binary_name();
        let protoc_path = project_root
            .join("node_modules/protoc/bin")
            .join(protoc_bin);
        if protoc_path.exists() {
            unsafe { std::env::set_var("PROTOC", protoc_path) };
        }
    }

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
        .protoc_arg("--experimental_allow_proto3_optional")
        .compile_protos(&proto_path_refs, &[project_root.to_str().unwrap()])
        .expect("Failed to compile protos");
}
