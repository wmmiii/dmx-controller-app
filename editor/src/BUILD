load("@aspect_bazel_lib//lib:copy_to_bin.bzl", "copy_to_bin")
load("@aspect_rules_esbuild//esbuild:defs.bzl", "esbuild")
load("@aspect_rules_ts//ts:defs.bzl", "ts_project")

COMMON_DEPS = [
        "//:node_modules/esbuild-scss-modules-plugin",
        "//:node_modules/@types/cie-rgb-color-converter",
        "//:node_modules/@types/react",
        "//:node_modules/@types/react-dom",
        "//:node_modules/@types/react-router-dom",
        "//:node_modules/@zip.js/zip.js",
        "//:node_modules/cie-rgb-color-converter",
        "//:node_modules/crunker",
        "//:node_modules/radix-ui",
        "//:node_modules/react",
        "//:node_modules/react-dom",
        "//:node_modules/react-icons",
        "//:node_modules/react-pick-color",
        "//:node_modules/react-router-dom",
        "//:node_modules/realtime-bpm-analyzer",
        "//:node_modules/uuid-by-string",
        "//:node_modules/wavesurfer.js",
        "//proto:ts_proto",
]

esbuild(
    name = "bundle",
    srcs = glob([
        "**/*.scss",
        "**/*.ts",
        "**/*.tsx",
    ]),
    config = "esbuild.config.mjs",
    entry_point = "app.tsx",
    minify = select({
        "//:opt_mode": True,
        "//conditions:default": False,
    }),
    target = "ES2022",
    tsconfig = "//:tsconfig",
    visibility = ["//editor:__pkg__"],
    deps = COMMON_DEPS,
)

ts_project(
    name = "src",
    srcs = glob([
        "**/*.ts",
        "**/*.tsx",
    ]),
    tsconfig = "//:tsconfig",
    deps = COMMON_DEPS,
)

copy_to_bin(
    name = "types",
    srcs = ["types.d.ts"],
    visibility = ["//:__subpackages__"],
)
