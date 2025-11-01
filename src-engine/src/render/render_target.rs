use std::fmt::Debug;

use crate::proto::{
    fixture_state::LightColor, Color, ColorPalette, FixtureState, QualifiedFixtureId,
};

const BLACK: Color = Color {
    red: 0.0,
    green: 0.0,
    blue: 0.0,
    white: Some(0.0),
};

const WHITE: Color = Color {
    red: 0.0,
    green: 0.0,
    blue: 0.0,
    white: Some(1.0),
};

pub trait RenderTarget<T: RenderTarget<T>>: Clone + Debug {
    fn apply_state(
        &mut self,
        fixture_id: &QualifiedFixtureId,
        state: &FixtureState,
        color_palette: &ColorPalette,
    );
    fn interpolate(&mut self, a: &T, b: &T, t: f64);
}

impl FixtureState {
    pub fn get_color(&self, color_palette: &ColorPalette) -> Option<Color> {
        return match self.light_color {
            Some(LightColor::Color(c)) => Some(c),
            Some(LightColor::PaletteColor(0)) => Some(BLACK),
            Some(LightColor::PaletteColor(1)) => Some(WHITE),
            Some(LightColor::PaletteColor(2)) => {
                Some(color_palette.primary.unwrap().color.unwrap())
            }
            Some(LightColor::PaletteColor(3)) => {
                Some(color_palette.secondary.unwrap().color.unwrap())
            }
            Some(LightColor::PaletteColor(4)) => {
                Some(color_palette.tertiary.unwrap().color.unwrap())
            }
            _ => None,
        };
    }
}
