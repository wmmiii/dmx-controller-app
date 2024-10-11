# DMX Controller App

You know what's easier than learning free DMX controller software?

Writing DMX controller software.

Hosted at https://dmx-controller.app

## Attaching to a DMX universe

To attach to a DMX universe this software requires special hardware to interface with DMX fixtures. Unfortunately certain browser behaviors prohibit using off the shelf UART boards to convert from USB serial to DMX.

The current solution is to use a [SparkFun ESP32 Thing Plus DMX to LED Shield](https://www.sparkfun.com/products/15110) along with a [
SparkFun Thing Plus - ESP32-S2 WROOM](https://www.sparkfun.com/products/17743) running custom software to perform the conversion.

@wmmiii has not yet published the custom software but if you ask nicely I'll clean up the code and stick it on my GitHub.

## Building

### Prerequisites
The only prerequisite is to have [Bazel](https://bazel.build/) installed on your machine. If you are on Windows may god help you as I have spent a couple of hours cursing Microsoft and haven't yet gotten a working Windows build. All development has been performed on Ubuntu so far.

### Running a dev server
Simply run:
```
bazel run //dev/server
```
and navigate to https://dev.dmx-controller.app:8080 using your favorite (Chromium) web browser. You may need to add security exceptions to allow the self-signed certificate to work. (Try typing "thisisunsafe" in the browser window if Chrome gives you an TLS warning).

Pro tip: Use [bazel-watcher](https://github.com/bazelbuild/bazel-watcher) to watch the local files and rebuild on changes.
