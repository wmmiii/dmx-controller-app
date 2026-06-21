use std::sync::LazyLock;

use crate::proto::{Color, ColorPalette, Project, color_palette::ColorDescription};

/// Default color palette used as a fallback when a palette cannot be found.
pub static DEFAULT_COLOR_PALETTE: LazyLock<ColorPalette> = LazyLock::new(|| ColorPalette {
    id: 0,
    name: "Default".to_string(),
    primary: Some(ColorDescription {
        color: Some(Color {
            red: 1.0,
            green: 0.0,
            blue: 1.0,
            white: None,
        }),
    }),
    secondary: Some(ColorDescription {
        color: Some(Color {
            red: 0.0,
            green: 1.0,
            blue: 1.0,
            white: None,
        }),
    }),
    tertiary: Some(ColorDescription {
        color: Some(Color {
            red: 1.0,
            green: 1.0,
            blue: 0.0,
            white: None,
        }),
    }),
});

/// Interpolate between two color palettes.
#[must_use]
pub fn interpolate_palettes(a: &ColorPalette, b: &ColorPalette, t: f64) -> ColorPalette {
    let interpolate_desc = |a: Option<&ColorDescription>,
                            b: Option<&ColorDescription>,
                            t: f64|
     -> Option<ColorDescription> {
        match (a, b) {
            (Some(a_desc), Some(b_desc)) => match (&a_desc.color, &b_desc.color) {
                (Some(a_color), Some(b_color)) => Some(ColorDescription {
                    color: Some(a_color.lerp(b_color, t)),
                }),
                _ => None,
            },
            (Some(a_desc), None) => Some(*a_desc),
            (None, Some(b_desc)) => Some(*b_desc),
            (None, None) => None,
        }
    };

    ColorPalette {
        id: u64::MAX,
        name: b.name.clone(),
        primary: interpolate_desc(a.primary.as_ref(), b.primary.as_ref(), t),
        secondary: interpolate_desc(a.secondary.as_ref(), b.secondary.as_ref(), t),
        tertiary: interpolate_desc(a.tertiary.as_ref(), b.tertiary.as_ref(), t),
    }
}

/// Calculate the interpolated color palette for a scene, handling
/// transitions between the previous and current active palette.
#[allow(
    clippy::cast_sign_loss,
    clippy::cast_possible_wrap,
    clippy::cast_precision_loss
)]
pub fn interpolated_scene_palette(project: &Project, scene_id: u64, system_t: u64) -> ColorPalette {
    let Some(scene) = project.scenes.get(&scene_id) else {
        return DEFAULT_COLOR_PALETTE.clone();
    };

    // Calculate transition progress (0.0 to 1.0)
    let color_palette_t = {
        let since = (system_t as i64) - (scene.color_palette_start_transition as i64);
        let since = if since < 0 { 0 } else { since as u64 };
        if scene.color_palette_transition_duration_ms == 0 {
            1.0
        } else {
            (since as f64 / f64::from(scene.color_palette_transition_duration_ms)).min(1.0)
        }
    };

    let last_palette = scene
        .color_palettes
        .iter()
        .find(|p| p.id == scene.last_active_color_palette)
        .cloned()
        .unwrap_or_else(|| DEFAULT_COLOR_PALETTE.clone());

    let active_palette = scene
        .color_palettes
        .iter()
        .find(|p| p.id == scene.active_color_palette)
        .cloned()
        .unwrap_or_else(|| DEFAULT_COLOR_PALETTE.clone());

    interpolate_palettes(&last_palette, &active_palette, color_palette_t)
}
