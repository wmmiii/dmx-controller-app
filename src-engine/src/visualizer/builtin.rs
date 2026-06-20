//! Built-in, read-only visualizers baked into the app. Users can copy these to
//! create editable versions. Built-in IDs are reserved (1-999) so they never
//! collide with user-created visualizer IDs.

pub struct BuiltinVisualizer {
    pub id: u64,
    pub name: &'static str,
    pub glsl_source: &'static str,
}

pub const BUILTIN_VISUALIZERS: &[BuiltinVisualizer] = &[
    BuiltinVisualizer {
        id: 1,
        name: "Rainbow Gradient",
        glsl_source: include_str!("shaders/rainbow.glsl"),
    },
    BuiltinVisualizer {
        id: 2,
        name: "Audio Bars",
        glsl_source: include_str!("shaders/audio_bars.glsl"),
    },
    BuiltinVisualizer {
        id: 3,
        name: "Beat Pulse",
        glsl_source: include_str!("shaders/beat_pulse.glsl"),
    },
    BuiltinVisualizer {
        id: 4,
        name: "Plasma",
        glsl_source: include_str!("shaders/plasma.glsl"),
    },
];

/// IDs 1-999 are reserved for built-in visualizers.
pub const BUILTIN_ID_RANGE: std::ops::Range<u64> = 1..1000;

#[must_use]
pub fn is_builtin(id: u64) -> bool {
    BUILTIN_ID_RANGE.contains(&id)
}
