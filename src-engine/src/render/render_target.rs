use crate::proto::{ColorPalette, FixtureState, QualifiedFixtureId};

pub trait RenderTarget<T: RenderTarget<T>>: Clone {
    fn apply_state(
        &mut self,
        fixture_id: &QualifiedFixtureId,
        state: &FixtureState,
        color_palette: &ColorPalette,
    );
    fn interpolate(&mut self, a: &T, b: &T, t: f64);
}
