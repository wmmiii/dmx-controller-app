load("@rules_pkg//pkg:pkg.bzl", "pkg_tar")

pkg_tar(
    name = "static_tar",
    srcs = [
        "//editor/src:bundle",
        "//editor/static",
    ],
    visibility = ["//dev/server:__pkg__"],
)
