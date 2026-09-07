use crate::events::EventSink;
use dmx_engine::beat::{BeatSampler, transition_beat};
use dmx_engine::proto::BeatMetadata;
use dmx_engine::project;
use std::sync::{Arc, Mutex};

pub type SharedBeatSampler = Arc<Mutex<BeatSampler>>;

pub fn add_sample(sampler: &mut BeatSampler, events: &dyn EventSink, t: u64) {
    if let Some(new_beat) = sampler.add_sample(t) {
        apply_beat(events, &new_beat, t);
    } else {
        events.beat_sampled();
    }
}

/// Moves the project's live beat onto `beat`, effective at time `t`.
///
/// Automatic beat tracking calls this directly: unlike tap tempo it estimates
/// tempo and phase itself, so it has no use for [`BeatSampler`]'s interval
/// averaging.
pub fn apply_beat(events: &dyn EventSink, beat: &BeatMetadata, t: u64) {
    match project::with_project_mut(|project| transition_beat(project, beat, t)) {
        Ok(()) => events.project_updated(),
        Err(e) => log::error!("Failed to apply beat transition: {e}"),
    }

    events.beat_sampled();
}
