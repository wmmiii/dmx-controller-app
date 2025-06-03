load("@aspect_rules_ts//ts:proto.bzl", "ts_proto_library")
load("@rules_proto//proto:defs.bzl", "proto_library")

proto_library(
    name = "proto_lib",
    srcs = glob(["*.proto"]),
)

ts_proto_library(
    name = "ts_proto",
    node_modules = "//:node_modules",
    proto = ":proto_lib",
    visibility = ["//editor/src:__pkg__"],
    copy_files = False,
    gen_connect_es = False,
)
