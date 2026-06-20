//! Built-in, read-only visualizers baked into the app. Users can copy these to
//! create editable versions. IDs are the map keys so they can never drift if
//! entries are added or removed.

use std::collections::HashMap;
use std::sync::LazyLock;

pub struct BuiltinVisualizer {
    pub name: &'static str,
    pub glsl_source: &'static str,
}

pub static BUILTIN_VISUALIZERS: LazyLock<HashMap<u64, BuiltinVisualizer>> =
    LazyLock::new(|| {
        let mut m = HashMap::new();
        m.insert(1, BuiltinVisualizer {
            name: "Rainbow Gradient",
            glsl_source: include_str!("shaders/rainbow.glsl"),
        });
        m.insert(2, BuiltinVisualizer {
            name: "Audio Bars",
            glsl_source: include_str!("shaders/audio_bars.glsl"),
        });
        m.insert(3, BuiltinVisualizer {
            name: "Beat Pulse",
            glsl_source: include_str!("shaders/beat_pulse.glsl"),
        });
        m.insert(4, BuiltinVisualizer {
            name: "Plasma",
            glsl_source: include_str!("shaders/plasma.glsl"),
        });
        m.insert(5, BuiltinVisualizer {
            name: "Vignette",
            glsl_source: include_str!("shaders/vignette.glsl"),
        });
        m.insert(6, BuiltinVisualizer {
            name: "Audio Polar",
            glsl_source: include_str!("shaders/audio_polar.glsl"),
        });
        m
    });

#[must_use]
pub fn is_builtin(id: u64) -> bool {
    BUILTIN_VISUALIZERS.contains_key(&id)
}
