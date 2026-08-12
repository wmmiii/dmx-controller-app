use crate::events::EventSink;
use dmx_engine::beat::{BeatSampler, transition_beat};
use dmx_engine::project;
use std::sync::{Arc, Mutex};

pub type SharedBeatSampler = Arc<Mutex<BeatSampler>>;

pub fn add_sample(sampler: &mut BeatSampler, events: &dyn EventSink, t: u64) {
    if let Some(new_beat) = sampler.add_sample(t) {
        let _ = project::with_project_mut(|project| transition_beat(project, &new_beat, t));
        events.project_updated();
    }

    events.beat_sampled();
}
