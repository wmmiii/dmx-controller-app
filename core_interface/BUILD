load("@rules_pkg//pkg:mappings.bzl", "pkg_files")
load("@rules_rust//rust:defs.bzl", "rust_binary")
load("@rules_rust//wasm_bindgen/rules_js:defs.bzl", "js_rust_wasm_bindgen")

rust_binary(
    name = "core_bin",
    srcs = ["src/main.rs"],
    edition = "2021",
    deps = [
        "@rules_rust//wasm_bindgen/3rdparty:wasm_bindgen",
    ],
)

js_rust_wasm_bindgen(
    name = "core_wasm",
    target = "web",
    visibility = ["//editor/src:__pkg__"],
    wasm_file = ":core_bin",
)

pkg_files(
    name = "core_files",
    srcs = [
        ":core_wasm",
    ],
    prefix = "",
    visibility = ["//editor:__pkg__"],
)
