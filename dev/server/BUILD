load("@bazel_skylib//rules:copy_file.bzl", "copy_file")
load("@rules_go//go:def.bzl", "go_binary", "go_library")

go_binary(
    name = "server_bin",
    embed = [":server_lib"],
    embedsrcs = [":package"],
    tags = ["ibazel_live_reload"],
)

go_library(
    name = "server_lib",
    srcs = ["main.go"],
    embedsrcs = ["package.tar"],
    importpath = "app.dmx-controller/dev/server",
    visibility = ["//visibility:private"],
)

sh_binary(
    name = "server",
    srcs = ["run_server.sh"],
    args = [
        "$(location :server_bin) $(location server.crt) $(location server.key)",
    ],
    data = [
        "server.crt",
        "server.key",
        ":server_bin",
    ],
    tags = ["ibazel_live_reload"],
)

copy_file(
    name = "package",
    src = "//editor:static_tar",
    out = "package.tar",
)
