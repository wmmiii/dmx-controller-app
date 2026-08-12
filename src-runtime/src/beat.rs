use crate::events::EventSink;
use dmx_engine::beat::{BeatSampler, transition_beat};
use dmx_engine::project;
use std::sync::{Arc, Mutex as StdMutex};

pub type SharedBeatSampler = Arc<StdMutex<RuntimeBeatSampler>>;

/// Wraps the platform-independent [`BeatSampler`] with the flags that decide
/// which tempo source is allowed to drive it.
#[derive(Default)]
pub struct RuntimeBeatSampler {
    inner: BeatSampler,
    pub sampling: bool,
    /// Set to `true` while an audio input device is connected and providing
    /// automatic beat detection. Manual tap commands are ignored in this state
    /// so the two sources don't interfere with BPM tracking.
    pub audio_active: bool,
}

impl RuntimeBeatSampler {
    pub fn add_sample(&mut self, events: &dyn EventSink, t: u64) {
        let new_beat_optional = self.inner.add_sample(t);
        self.sampling = true;

        if let Some(new_beat) = new_beat_optional {
            let _ = project::with_project_mut(|project| transition_beat(project, &new_beat, t));
            events.project_updated();
        }

        events.beat_sampling_state(true);
    }
}
