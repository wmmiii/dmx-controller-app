load("@rules_proto//proto:defs.bzl", "proto_library")
load("@rules_rust//proto/protobuf:defs.bzl", "rust_proto_library")

proto_library(
    name = "proto_lib",
    srcs = [
        "fixture.proto",
    ],
)

rust_proto_library(
    name = "rust_proto",
    crate_name = "dmx_controller_proto",
    visibility = ["//core_interface:__pkg__"],
    deps = [":proto_lib"],
)
