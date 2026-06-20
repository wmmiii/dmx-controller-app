#![allow(clippy::cast_possible_truncation)]

use crate::proto::Color;
use crate::proto::ColorPalette;
use crate::proto::DisplayBuffer;
use crate::proto::DisplayRenderTarget;
use crate::render::render_target::RenderTarget;

impl DisplayBuffer {
    /// Create a new buffer initialized to black.
    #[must_use]
    pub fn new(id: u64, width: u32, height: u32) -> Self {
        let pixel_count = (width * height) as usize;
        Self {
            id,
            width,
            height,
            pixels: vec![0.0; pixel_count * 3],
        }
    }

    /// Sample pixel at (x, y). Returns None if out of bounds (including negative coordinates).
    #[allow(clippy::cast_sign_loss)]
    #[must_use]
    pub fn sample(&self, x: i32, y: i32) -> Option<(f32, f32, f32)> {
        if x < 0 || y < 0 {
            return None;
        }
        let x = x as u32;
        let y = y as u32;
        if x >= self.width || y >= self.height {
            return None;
        }
        let idx = ((y * self.width + x) * 3) as usize;
        Some((self.pixels[idx], self.pixels[idx + 1], self.pixels[idx + 2]))
    }

    /// Set pixel at (x, y). No-op if out of bounds.
    #[allow(clippy::many_single_char_names)]
    pub fn set(&mut self, x: u32, y: u32, red: f32, green: f32, blue: f32) {
        if x >= self.width || y >= self.height {
            return;
        }
        let idx = ((y * self.width + x) * 3) as usize;
        self.pixels[idx] = red;
        self.pixels[idx + 1] = green;
        self.pixels[idx + 2] = blue;
    }

    /// Downsample the buffer to fit within `max_size` dimensions.
    /// Uses box filtering (averaging) for smooth results.
    /// Returns self unchanged if already within `max_size`.
    #[must_use]
    pub fn downsample(&self, max_size: u32) -> Self {
        let factor = (self.width.max(self.height) / max_size).max(1);
        if factor <= 1 {
            return self.clone();
        }

        let new_width = (self.width / factor).max(1);
        let new_height = (self.height / factor).max(1);
        let mut result = Self::new(self.id, new_width, new_height);

        // Box filter: average each factor×factor block
        for y in 0..new_height {
            for x in 0..new_width {
                let (mut r, mut g, mut b, mut n) = (0.0, 0.0, 0.0, 0.0);
                for dy in 0..factor {
                    for dx in 0..factor {
                        // Sample using u32 coordinates directly to avoid i32 wrap concerns
                        let src_x = x * factor + dx;
                        let src_y = y * factor + dy;
                        if src_x < self.width && src_y < self.height {
                            let idx = ((src_y * self.width + src_x) * 3) as usize;
                            r += self.pixels[idx];
                            g += self.pixels[idx + 1];
                            b += self.pixels[idx + 2];
                            n += 1.0;
                        }
                    }
                }
                if n > 0.0 {
                    result.set(x, y, r / n, g / n, b / n);
                }
            }
        }

        result
    }
}

impl RenderTarget<DisplayRenderTarget> for DisplayRenderTarget {
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

    fn interpolate(&mut self, a: &DisplayRenderTarget, b: &DisplayRenderTarget, t: f64) {
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
        panic!("Cannot perform fixture debug for display render target!");
    }
}
