use crate::events::EventSink;
use dmx_engine::beat::{BeatSampler, transition_beat};
use dmx_engine::project;
use std::sync::{Arc, Mutex};

pub type SharedBeatSampler = Arc<Mutex<BeatSampler>>;

pub fn add_sample(sampler: &mut BeatSampler, events: &dyn EventSink, t: u64) {
    if let Some(new_beat) = sampler.add_sample(t) {
        match project::with_project_mut(|project| transition_beat(project, &new_beat, t)) {
            Ok(()) => events.project_updated(),
            Err(e) => log::error!("Failed to apply beat transition: {e}"),
        }
    }

    events.beat_sampled();
}
