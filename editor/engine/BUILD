load("@rules_rust//rust:defs.bzl", "rust_binary")

rust_binary(
    name = "engine",
    srcs = ["src/main.rs"],
    deps = ["//core:core_lib"],
    edition = "2021",
    visibility = ["//visibility:public"],
)
