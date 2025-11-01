use crate::proto::wled_render_target::Color;
use crate::proto::ColorPalette;
use crate::proto::WledRenderTarget;
use crate::render::render_target::RenderTarget;

macro_rules! lerp {
    ($a:expr, $b:expr, $t:expr) => {
        $a + ($b - $a) * $t
    };
}

impl<'a> RenderTarget<WledRenderTarget> for WledRenderTarget {
    fn apply_state(
        &mut self,
        qualified_fixture_id: &crate::proto::QualifiedFixtureId,
        state: &crate::proto::FixtureState,
        color_palette: &ColorPalette,
    ) {
        if qualified_fixture_id.output != self.id {
            return;
        }

        let mut segment = self.segments[qualified_fixture_id.fixture as usize];

        if let Some(effect) = state.wled_effect {
            segment.effect = effect;
        }

        if let Some(palette) = state.wled_palette {
            segment.palette = palette;
        }

        if let Some(color) = state.get_color(color_palette) {
            if let Some(white) = color.white {
                segment.primary_color = Some(Color {
                    red: (color.red + white) as f32,
                    green: (color.green + white) as f32,
                    blue: (color.blue + white) as f32,
                })
            } else {
                segment.primary_color = Some(Color {
                    red: color.red as f32,
                    green: color.green as f32,
                    blue: color.blue as f32,
                })
            }
        }

        if let Some(dimmer) = state.dimmer {
            segment.brightness = dimmer as f32;
        }

        self.segments[qualified_fixture_id.fixture as usize] = segment;
    }

    fn interpolate(&mut self, a: &WledRenderTarget, b: &WledRenderTarget, t: f64) {
        let interpolate_color = |a: &Option<Color>, b: &Option<Color>, t: f32| -> Option<Color> {
            let a_color = a.unwrap();
            let b_color = b.unwrap();

            Some(Color {
                red: (1.0 - t) * a_color.red + t * b_color.red,
                green: (1.0 - t) * a_color.green + t * b_color.green,
                blue: (1.0 - t) * a_color.blue + t * b_color.blue,
            })
        };

        for index in 0..self.segments.len() {
            let mut segment = self.segments[index];
            let a_segment = a.segments[index];
            let b_segment = b.segments[index];

            if t < 0.5 {
                segment.effect = a_segment.effect;
                segment.palette = a_segment.palette;
            } else {
                segment.effect = b_segment.effect;
                segment.palette = b_segment.palette;
            }

            segment.primary_color =
                interpolate_color(&a_segment.primary_color, &b_segment.primary_color, t as f32);

            segment.speed = lerp!(a_segment.speed, b_segment.speed, t as f32);
            segment.brightness = lerp!(a_segment.brightness, b_segment.brightness, t as f32);

            self.segments[index] = segment;
        }
    }
}
