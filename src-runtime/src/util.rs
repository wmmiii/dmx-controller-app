use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

/// Milliseconds since the Unix epoch, the time base every render entry point
/// takes. Only a system clock set before 1970 can fail, which yields 0 rather
/// than taking down a render loop.
#[must_use]
#[allow(clippy::cast_possible_truncation)]
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since_epoch| since_epoch.as_millis() as u64)
}

/// Takes a lock, recovering the guard if a previous holder panicked.
///
/// Every mutex in this crate guards state that stays usable after a panic
/// elsewhere — device handles, cached connections — so propagating poison
/// would stop output for a fault that has already passed.
pub(crate) fn lock_or_recover<'a, T>(mutex: &'a Mutex<T>, guarded: &str) -> MutexGuard<'a, T> {
    mutex.lock().unwrap_or_else(|e| {
        log::error!("{guarded} lock poisoned, recovering");
        e.into_inner()
    })
}
