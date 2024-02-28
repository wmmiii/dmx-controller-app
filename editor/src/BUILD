load("@aspect_rules_esbuild//esbuild:defs.bzl", "esbuild")
load("@aspect_rules_ts//ts:defs.bzl", "ts_project")
load("@bazel_skylib//rules:build_test.bzl", "build_test")

TS_DEPS = [
    "//:node_modules/@types/dom-serial",
    "//:node_modules/@types/react",
    "//:node_modules/@types/react-dom",
    "//:node_modules/esbuild-scss-modules-plugin",
    "//:node_modules/react",
    "//:node_modules/react-dom",
    "//:node_modules/react-router",
    "//:node_modules/react-router-dom",
    # "//core_interface:core_wasm",
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
    tsconfig = "//:tsconfig",
    minify = True,
    visibility = ["//editor:__pkg__"],
    deps = TS_DEPS,
)

ts_project(
    name = "typecheck",
    srcs = glob(
        [
            "**/*.ts",
            "**/*.tsx",
        ],
    ),
    allow_js = True,
    declaration = False,
    declaration_map = True,
    preserve_jsx = True,
    source_map = True,
    transpiler = "tsc",
    tsconfig = "//:tsconfig",
    deps = TS_DEPS,
)

build_test(
    name = "typecheck_test",
    targets = [
        ":typecheck",
    ],
)
