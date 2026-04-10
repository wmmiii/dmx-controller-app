# Debugging Serial DMX Flickering on Windows

## Problem Description

A cheap laser connected via serial DMX output flickers on a less powerful Windows laptop, but works smoothly on Linux. Additionally, sACN output doesn't activate the laser at all on Windows (though sACN works for other DMX lights).

**Tested so far:**

- Lowering FPS to 30 Hz did not resolve the flickering

## Diagnostics Added

Timing diagnostics have been added to `src-tauri/src/output_loop.rs` (lines 329-436). Every 5 seconds, the output loop logs:

```
Output {id} timing: late_frames={n}, max_interval={ms}ms, avg_render={ms}ms, avg_output={ms}ms
```

**Metrics explained:**

- `late_frames` - Number of frames that arrived >50% later than expected (indicates jitter)
- `max_interval` - Worst-case time between frames in ms (at 30 FPS, expected is ~33ms)
- `avg_render` - Average time to render DMX data (should be <1ms)
- `avg_output` - Average time to write to serial port (should be <5ms)

## How to Run Diagnostics on Windows

1. Build and run the app:

   ```bash
   pnpm run tauri:dev
   ```

2. Connect the laser via serial DMX

3. Watch the Tauri logs (visible in terminal or dev console)

4. Look for timing log entries every 5 seconds

## Interpreting Results

| Symptom                                        | Likely Cause                           | Next Steps                                                             |
| ---------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| `late_frames` high, `max_interval` >> expected | Windows timer/scheduler jitter         | Implement spin-waiting or Windows multimedia timers                    |
| `avg_output` high (>10ms)                      | Serial driver or USB adapter slow      | Try different USB port, update drivers, or add write buffering         |
| `max_interval` spikes occasionally             | Background process interference        | Check CPU usage, try with fewer apps running                           |
| Metrics look normal but still flickering       | Issue is in the laser's DMX processing | Try different DMX channels, check laser manual for timing requirements |

## Root Cause Hypotheses

1. **Windows timer jitter**: `tokio::time::sleep` has 1-15ms granularity on Windows vs microseconds on Linux. At 30 FPS (~33ms per frame), 15ms jitter is significant.

2. **Serial driver buffering**: Windows USB-to-serial drivers may have different buffering behavior than Linux, causing inconsistent DMX packet delivery.

3. **Cheap laser limitations**: The laser's DMX interface may not handle the timing variations well (even if technically valid DMX).

## Potential Fixes (After Diagnosis Confirms Cause)

### If timing jitter is confirmed:

**Option A: Spin-waiting for precise timing**

```rust
// Replace tokio::time::sleep with spin-wait for final milliseconds
let elapsed = loop_start.elapsed();
if let Some(remaining) = frame_duration.checked_sub(elapsed) {
    if remaining > Duration::from_millis(2) {
        tokio::time::sleep(remaining - Duration::from_millis(2)).await;
    }
    // Spin-wait for remaining time
    while loop_start.elapsed() < frame_duration {
        std::hint::spin_loop();
    }
}
```

**Option B: Windows multimedia timers**

```rust
#[cfg(windows)]
unsafe {
    windows::Win32::Media::timeBeginPeriod(1); // Request 1ms timer resolution
}
```

### If serial write is slow:

Consider double-buffering or async serial writes to prevent blocking the render loop.

## sACN Issue (Secondary)

The sACN issue (laser not responding while other lights work) may be a separate problem:

1. **Check Windows Firewall**: Ensure UDP port 5568 outbound is allowed
2. **Universe registration**: In `src-tauri/src/sacn.rs`, the universe is registered on every frame call (line 47-48). This may cause overhead. Consider registering once at initialization.
3. **Network interface**: The code binds to `0.0.0.0` which may route differently on Windows with multiple NICs

## Files Modified

- `src-tauri/src/output_loop.rs` - Added timing diagnostics (lines 329-436)

## Files to Investigate

- `src-tauri/src/serial.rs` - Serial DMX output implementation
- `src-tauri/src/sacn.rs` - sACN output implementation
- `open_dmx` crate - Third-party DMX serial library (no timing control exposed)

## Next Steps

1. Run the app on Windows with laser connected
2. Collect timing logs for ~1 minute
3. Compare metrics with Linux (if possible)
4. Based on results, implement appropriate fix from options above
5. Test sACN separately once serial is resolved
