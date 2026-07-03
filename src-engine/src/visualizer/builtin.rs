use std::collections::HashMap;
use std::sync::LazyLock;

pub struct BuiltinVisualizer {
    pub name: &'static str,
    pub glsl_source: &'static str,
}

pub static BUILTIN_VISUALIZERS: LazyLock<HashMap<u64, BuiltinVisualizer>> = LazyLock::new(|| {
    let mut m = HashMap::new();
    m.insert(
        0,
        BuiltinVisualizer {
            name: "Col. Black",
            glsl_source: include_str!("shaders/col_black.glsl"),
        },
    );
    m.insert(
        1,
        BuiltinVisualizer {
            name: "Col. Color",
            glsl_source: include_str!("shaders/col_color.glsl"),
        },
    );
    m.insert(
        2,
        BuiltinVisualizer {
            name: "Col. Plasma",
            glsl_source: include_str!("shaders/col_plasma.glsl"),
        },
    );
    m.insert(
        3,
        BuiltinVisualizer {
            name: "Col. Rainbow",
            glsl_source: include_str!("shaders/col_rainbow.glsl"),
        },
    );
    m.insert(
        4,
        BuiltinVisualizer {
            name: "Ef. Fade",
            glsl_source: include_str!("shaders/ef_fade.glsl"),
        },
    );
    m.insert(
        5,
        BuiltinVisualizer {
            name: "Mask Audio Bars",
            glsl_source: include_str!("shaders/msk_audio_bars.glsl"),
        },
    );
    m.insert(
        6,
        BuiltinVisualizer {
            name: "Mask Beat Pulse",
            glsl_source: include_str!("shaders/msk_beat_pulse.glsl"),
        },
    );
    m.insert(
        7,
        BuiltinVisualizer {
            name: "Mask Vignette",
            glsl_source: include_str!("shaders/msk_vignette.glsl"),
        },
    );
    m.insert(
        8,
        BuiltinVisualizer {
            name: "Vis. Audio 3D",
            glsl_source: include_str!("shaders/vis_audio_3d.glsl"),
        },
    );
    m.insert(
        9,
        BuiltinVisualizer {
            name: "Vis. Audio Blob",
            glsl_source: include_str!("shaders/vis_audio_blob.glsl"),
        },
    );
    m.insert(
        10,
        BuiltinVisualizer {
            name: "Vis. Audio Wave",
            glsl_source: include_str!("shaders/vis_audio_wave.glsl"),
        },
    );
    m
});

#[must_use]
pub fn is_builtin(id: u64) -> bool {
    BUILTIN_VISUALIZERS.contains_key(&id)
}
