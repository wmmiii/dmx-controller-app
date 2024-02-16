load("@bazel_skylib//rules:copy_file.bzl", "copy_file")
load("@rules_pkg//pkg:mappings.bzl", "pkg_filegroup", "pkg_files")

pkg_filegroup(
    name = "static",
    srcs = [
        ":root_files",
        ":static_files",
    ],
    visibility = ["//editor:__pkg__"],
)

pkg_files(
    name = "root_files",
    srcs = [
        "index.html",
        ":404",
    ],
    visibility = ["//editor:__pkg__"],
)

pkg_files(
    name = "static_files",
    srcs = glob(
        ["*"],
        exclude = [
            "BUILD",
            "index.html",
        ],
    ),
    prefix = "static",
)

copy_file(
    name = "404",
    src = "index.html",
    out = "404.html",
)
