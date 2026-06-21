use crate::proto::Color;

impl Color {
    /// Linearly interpolate between two colors. (0.0 is self)
    #[must_use]
    pub fn lerp(&self, other: &Color, t: f64) -> Color {
        Color {
            red: (1.0 - t) * self.red + t * other.red,
            green: (1.0 - t) * self.green + t * other.green,
            blue: (1.0 - t) * self.blue + t * other.blue,
            white: match (self.white, other.white) {
                (Some(a), Some(b)) => Some((1.0 - t) * a + t * b),
                (Some(a), None) => Some((1.0 - t) * a),
                (None, Some(b)) => Some(t * b),
                (None, None) => None,
            },
        }
    }
}
