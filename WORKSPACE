workspace(name = "dmx-controller-app")

load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive")

###############################################################################
# R U L E S   P K G
###############################################################################

http_archive(
    name = "rules_pkg",
    sha256 = "eea0f59c28a9241156a47d7a8e32db9122f3d50b505fae0f33de6ce4d9b61834",
    urls = [
        "https://mirror.bazel.build/github.com/bazelbuild/rules_pkg/releases/download/0.8.0/rules_pkg-0.8.0.tar.gz",
        "https://github.com/bazelbuild/rules_pkg/releases/download/0.8.0/rules_pkg-0.8.0.tar.gz",
    ],
)

load("@rules_pkg//:deps.bzl", "rules_pkg_dependencies")

rules_pkg_dependencies()

###############################################################################
# G O L A N G   D E P S
###############################################################################

load("//:deps.bzl", "go_dependencies")

# gazelle:repository_macro deps.bzl%go_dependencies
go_dependencies()

###############################################################################
# R U L E S  R U S T
###############################################################################

http_archive(
    name = "rules_rust",
    integrity = "sha256-GuRaQT0LlDOYcyDfKtQQ22oV+vtsiM8P0b87qsvoJts=",
    urls = ["https://github.com/bazelbuild/rules_rust/releases/download/0.39.0/rules_rust-v0.39.0.tar.gz"],
)


load("@rules_rust//rust:repositories.bzl", "rust_repositories")

rust_repositories()


load("@rules_rust//wasm_bindgen:repositories.bzl", "rust_wasm_bindgen_dependencies", "rust_wasm_bindgen_register_toolchains")

rust_wasm_bindgen_dependencies()

rust_wasm_bindgen_register_toolchains()
