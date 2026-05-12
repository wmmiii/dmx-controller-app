#![allow(clippy::cast_possible_truncation)]

use crate::proto::Color;
use crate::proto::ColorPalette;
use crate::proto::DdpRenderTarget;
use crate::render::render_target::RenderTarget;

impl RenderTarget<DdpRenderTarget> for DdpRenderTarget {
    fn apply_state(
        &mut self,
        qualified_fixture_id: &crate::proto::QualifiedFixtureId,
        state: &crate::proto::FixtureState,
        color_palette: &ColorPalette,
    ) {
        if qualified_fixture_id.output != self.id {
            return;
        }

        if let Some(color) = state.get_color(color_palette) {
            self.color = Some(color);
        }

        if let Some(dimmer) = state.dimmer {
            self.dimmer = dimmer as f32;
        }
    }

    fn interpolate(&mut self, a: &DdpRenderTarget, b: &DdpRenderTarget, t: f64) {
        self.color = match (&a.color, &b.color) {
            (Some(a_color), Some(b_color)) => Some(Color {
                red: (1.0 - t) * a_color.red + t * b_color.red,
                green: (1.0 - t) * a_color.green + t * b_color.green,
                blue: (1.0 - t) * a_color.blue + t * b_color.blue,
                white: match (a_color.white, b_color.white) {
                    (Some(a_w), Some(b_w)) => Some((1.0 - t) * a_w + t * b_w),
                    (Some(a_w), None) => Some(a_w),
                    (None, Some(b_w)) => Some(b_w),
                    _ => None,
                },
            }),
            (Some(a_color), None) => Some(*a_color),
            (None, Some(b_color)) => Some(*b_color),
            (None, None) => None,
        };

        self.dimmer = ((1.0 - t) * f64::from(a.dimmer) + t * f64::from(b.dimmer)) as f32;
    }

    fn apply_fixture_debug(&mut self, _fixture_debug: &crate::proto::render_mode::FixtureDebug) {
        panic!("Cannot perform fixture debug for DDP render target!");
    }
}
