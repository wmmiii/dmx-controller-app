load("@aspect_rules_esbuild//esbuild:defs.bzl", "esbuild")
load("@aspect_rules_ts//ts:defs.bzl", "ts_project")
load("@bazel_skylib//rules:build_test.bzl", "build_test")

TS_DEPS = [
    "//:node_modules/@bufbuild/protobuf",
    "//:node_modules/@types/dom-serial",
    "//:node_modules/@types/react",
    "//:node_modules/@types/react-dom",
    "//:node_modules/crunker",
    "//:node_modules/esbuild-scss-modules-plugin",
    "//:node_modules/react",
    "//:node_modules/react-dom",
    "//:node_modules/react-pick-color",
    "//:node_modules/react-router",
    "//:node_modules/react-router-dom",
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
    target = "ES2022",
    entry_point = "app.tsx",
    minify = select({ "//:opt_mode": True, "//conditions:default": False }),
    tsconfig = "//:tsconfig",
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
