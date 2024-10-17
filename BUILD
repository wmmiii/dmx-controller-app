load("@aspect_rules_ts//ts:defs.bzl", "ts_config")
load("@npm//:defs.bzl", "npm_link_all_packages")
load("@gazelle//:def.bzl", "gazelle")

npm_link_all_packages(name = "node_modules")

# gazelle:prefix app.dmx-controller
gazelle(name = "gazelle")

# gazelle:prefix app.dmx-controller
gazelle(
    name = "gazelle-update-repos",
    args = [
        "-from_file=go.mod",
        "-to_macro=deps.bzl%go_dependencies",
        "-prune",
        "-build_external=vendored",
    ],
    command = "update-repos",
)

ts_config(
    name = "tsconfig",
    src = "tsconfig.json",
    visibility = [":__subpackages__"],
)

config_setting(
    name = "opt_mode",
    values = {"compilation_mode": "opt"},
    visibility = ["//visibility:public"],
)
