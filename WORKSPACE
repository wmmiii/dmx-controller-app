workspace(name = "dmx-controller-app")

load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive")

###############################################################################
# G O L A N G   D E P S
###############################################################################

load("//:deps.bzl", "go_dependencies")

# gazelle:repository_macro deps.bzl%go_dependencies
go_dependencies()
