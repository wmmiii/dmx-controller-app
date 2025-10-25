use std::collections::HashMap;
use std::sync::OnceLock;

use crate::proto::dmx_fixture_definition::Mode;
use crate::proto::fixture_state::LightColor;
use crate::proto::{Color, ColorPalette, DmxFixtureDefinition, SerialDmxOutput};
use crate::render::RenderTarget;

macro_rules! apply_channel_updates {
    ($updates:expr, $fixture_offset:expr, $mode:expr, $state:expr, [
        $(($field:ident, $channel_type:expr, $update_fn:ident)),* $(,)?
    ]) => {
        $(
            if let Some(value) = $state.$field {
                $updates.extend(DmxRenderTarget::$update_fn(
                    $fixture_offset,
                    $mode,
                    $channel_type,
                    value,
                ));
            }
        )*
    };
}

#[derive(Clone)]
pub struct DmxRenderTarget<'a> {
    universe: [f64; 512],
    output: &'a SerialDmxOutput,
    fixture_definitions: &'a HashMap<u64, DmxFixtureDefinition>,
    non_interpolated_indices: OnceLock<Vec<u16>>,
}

impl<'a> DmxRenderTarget<'a> {
    pub fn new(
        output: &'a SerialDmxOutput,
        fixture_definitions: &'a HashMap<u64, DmxFixtureDefinition>,
    ) -> Self {
        DmxRenderTarget {
            universe: [0.0; 512],
            output,
            fixture_definitions,
            non_interpolated_indices: OnceLock::new(),
        }
    }

    pub fn get_universe(&self) -> [u8; 512] {
        self.universe.map(|v| (v * 255.0).clamp(0.0, 255.0) as u8)
    }

    fn get_fixture_mode(&self, fixture_id: &u64) -> Option<&Mode> {
        self.output.fixtures.get(fixture_id).and_then(|f| {
            self.fixture_definitions
                .get(&f.fixture_definition_id)
                .and_then(|d| d.modes.get(&f.fixture_mode))
        })
    }

    fn get_non_interpolated_indices(&self) -> Vec<u16> {
        self.non_interpolated_indices.get_or_init(|| {
            let mut indices: Vec<u16> = Vec::new();
            for (fixture_id, fixture) in &self.output.fixtures {
                let mode = match self.get_fixture_mode(&fixture_id) {
                    Some(m) => m,
                    None => continue,
                };

                for (index, channel) in &mode.channels {
                    match channel.mapping {
                        Some(crate::proto::dmx_fixture_definition::channel::Mapping::ColorWheelMapping(_)) => indices.push((index + fixture.channel_offset) as u16),
                        Some(_) => (),
                        None => (),
                    }
                }
            }
            return indices;
        }).to_vec()
    }

    fn compute_color_channel_updates(
        fixture_offset: u32,
        mode: &Mode,
        color: Color,
    ) -> Vec<(usize, f64)> {
        let red: f64;
        let green: f64;
        let blue: f64;
        let white: f64;

        let w_value = match color.white {
            Some(white) => white,
            None => 0.0,
        };
        if mode.channels.iter().any(|(_, c)| c.r#type == "white") {
            red = color.red;
            green = color.green;
            blue = color.blue;
            white = w_value;
        } else {
            red = color.red + w_value;
            green = color.green + w_value;
            blue = color.blue + w_value;
            white = 0.0;
        }

        mode.channels
            .iter()
            .filter_map(|(index, channel)| {
                let channel_index = (index + fixture_offset) as usize;

                match channel.r#type.as_str() {
                    "red" => Some((channel_index, red)),
                    "green" => Some((channel_index, green)),
                    "blue" => Some((channel_index, blue)),
                    "white" => Some((channel_index, white)),
                    _ => None,
                }
            })
            .collect()
    }

    fn compute_amount_channel_updates(
        fixture_offset: u32,
        mode: &Mode,
        channel_type: &str,
        value: f64,
    ) -> Vec<(usize, f64)> {
        mode.channels
            .iter()
            .filter(|(_, channel)| channel.r#type == channel_type)
            .filter_map(|(index, channel)| {
                let mapping = match &channel.mapping {
                    Some(
                        crate::proto::dmx_fixture_definition::channel::Mapping::AmountMapping(m),
                    ) => m,
                    _ => return None,
                };

                let channel_index = (index + fixture_offset) as usize;

                let min = mapping.min_value as f64 / 255.0;
                let max = mapping.max_value as f64 / 255.0;
                let mapped_value: f64 = min + value * (max - min);

                Some((channel_index, mapped_value))
            })
            .collect()
    }

    fn compute_angle_channel_updates(
        fixture_offset: u32,
        mode: &Mode,
        channel_type: &str,
        degrees: f64,
    ) -> Vec<(usize, f64)> {
        mode.channels
            .iter()
            .filter(|(_, channel)| channel.r#type == channel_type)
            .filter_map(|(index, channel)| {
                let mapping = match &channel.mapping {
                    Some(crate::proto::dmx_fixture_definition::channel::Mapping::AngleMapping(
                        m,
                    )) => m,
                    _ => return None,
                };

                let channel_index = (index + fixture_offset) as usize;

                let min = mapping.min_degrees as f64;
                let max = mapping.max_degrees as f64;

                let mapped_value: f64 = (degrees - min) / (max - min);

                println!(
                    "min {} max {} degrees {} value {}",
                    min, max, degrees, mapped_value
                );

                Some((channel_index, mapped_value))
            })
            .collect()
    }

    fn apply_updates(&mut self, updates: Vec<(usize, f64)>) {
        for (channel_index, val) in updates {
            self.universe[channel_index] = val;
        }
    }
}

impl<'a> RenderTarget<DmxRenderTarget<'a>> for DmxRenderTarget<'a> {
    fn apply_state(
        &mut self,
        qualified_fixture_id: &crate::proto::QualifiedFixtureId,
        state: &crate::proto::FixtureState,
        color_palette: &ColorPalette,
    ) {
        let fixture = match self.output.fixtures.get(&qualified_fixture_id.fixture) {
            Some(f) => f,
            None => return,
        };

        let mode = match self.get_fixture_mode(&qualified_fixture_id.fixture) {
            Some(d) => d,
            None => return,
        };

        let mut all_updates = Vec::new();

        if let Some(light_color) = state.light_color {
            let color = match light_color {
                LightColor::Color(c) => c,
                LightColor::PaletteColor(0) => Color {
                    red: 0.0,
                    green: 0.0,
                    blue: 0.0,
                    white: Some(0.0),
                },
                LightColor::PaletteColor(1) => Color {
                    red: 0.0,
                    green: 0.0,
                    blue: 0.0,
                    white: Some(1.0),
                },
                LightColor::PaletteColor(2) => match &color_palette.primary {
                    Some(desc) => match &desc.color {
                        Some(c) => c.clone(),
                        None => return,
                    },
                    None => return,
                },
                LightColor::PaletteColor(3) => match &color_palette.secondary {
                    Some(desc) => match &desc.color {
                        Some(c) => c.clone(),
                        None => return,
                    },
                    None => return,
                },
                LightColor::PaletteColor(4) => match &color_palette.tertiary {
                    Some(desc) => match &desc.color {
                        Some(c) => c.clone(),
                        None => return,
                    },
                    None => return,
                },
                _ => return,
            };
            all_updates.extend(Self::compute_color_channel_updates(
                fixture.channel_offset,
                mode,
                color,
            ));
        }

        apply_channel_updates!(
            all_updates,
            fixture.channel_offset,
            mode,
            state,
            [
                (pan, "pan", compute_angle_channel_updates),
                (tilt, "tilt", compute_angle_channel_updates),
                (dimmer, "dimmer", compute_amount_channel_updates),
                (strobe, "strobe", compute_amount_channel_updates),
                (width, "width", compute_amount_channel_updates),
                (height, "height", compute_amount_channel_updates),
                (zoom, "zoom", compute_amount_channel_updates),
            ]
        );

        self.apply_updates(all_updates);
    }

    fn interpolate(&mut self, a: &DmxRenderTarget<'a>, b: &DmxRenderTarget<'a>, t: f64) {
        let non_interpolated_indices = self.get_non_interpolated_indices();

        for i in 0..512 {
            if non_interpolated_indices.contains(&i) {
                if t < 0.5 {
                    self.universe[i as usize] = a.universe[i as usize];
                } else {
                    self.universe[i as usize] = b.universe[i as usize];
                }
            } else {
                let a_val = a.universe[i as usize];
                let b_val = b.universe[i as usize];
                let diff = b_val - a_val;

                self.universe[i as usize] = a_val + t * diff;
            }
        }

        // Next, recover any indices that should not be interpolated
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proto::dmx_fixture_definition::channel::Mapping;
    use crate::proto::dmx_fixture_definition::Channel;
    use crate::proto::{FixtureState, PhysicalDmxFixture, QualifiedFixtureId};
    use std::collections::HashMap;

    #[test]
    fn test_dimmer_channel_updates() {
        // Create a simple fixture definition with a dimmer channel
        let mut fixture_def = DmxFixtureDefinition::default();
        fixture_def.global_id = "test-fixture".to_string();
        fixture_def.name = "Test Fixture".to_string();

        let mut mode = Mode::default();
        mode.name = "test-mode".to_string();
        mode.num_channels = 1;

        // Add a dimmer channel at index 0
        let mut dimmer_channel = Channel::default();
        dimmer_channel.r#type = "dimmer".to_string();
        dimmer_channel.mapping = Some(Mapping::AmountMapping(
            crate::proto::dmx_fixture_definition::channel::AmountMapping {
                min_value: 0,
                max_value: 255,
            },
        ));
        mode.channels.insert(0, dimmer_channel);

        fixture_def.modes.insert("test-mode".to_string(), mode);

        // Create fixture definitions map
        let mut fixture_definitions = HashMap::new();
        fixture_definitions.insert(1u64, fixture_def);

        // Create a physical fixture at channel 0
        let mut physical_fixture = PhysicalDmxFixture::default();
        physical_fixture.name = "Test Fixture 1".to_string();
        physical_fixture.fixture_definition_id = 1;
        physical_fixture.fixture_mode = "test-mode".to_string();
        physical_fixture.channel_offset = 0;

        // Create output with the fixture
        let mut output = SerialDmxOutput::default();
        output.fixtures.insert(100u64, physical_fixture);

        // Create render target
        let mut render_target = DmxRenderTarget::new(&output, &fixture_definitions);

        // Create a fixture state with dimmer at 50%
        let mut state = FixtureState::default();
        state.dimmer = Some(0.5);

        let qualified_id = QualifiedFixtureId {
            patch: 0,
            output: 123,
            fixture: 100,
        };

        // Create a color palette
        let color_palette = ColorPalette::default();

        // Apply the state
        render_target.apply_state(&qualified_id, &state, &color_palette);

        // Get the universe
        let universe = render_target.get_universe();

        // Channel 0 should be at 50% (127/128)
        assert!(
            universe[0] >= 127 && universe[0] <= 128,
            "Expected dimmer at ~127-128, got {}",
            universe[0]
        );

        // All other channels should be 0
        for i in 1..512 {
            assert_eq!(universe[i], 0, "Channel {} should be 0", i);
        }
    }

    #[test]
    fn test_pan_tilt_channel_updates() {
        // Create a fixture definition with pan and tilt channels
        let mut fixture_def = DmxFixtureDefinition::default();
        fixture_def.global_id = "test-moving-head".to_string();
        fixture_def.name = "Test Moving Head".to_string();

        let mut mode = Mode::default();
        mode.name = "test-mode".to_string();
        mode.num_channels = 2;

        // Add pan channel at index 0 (0-540 degrees)
        let mut pan_channel = Channel::default();
        pan_channel.r#type = "pan".to_string();
        pan_channel.mapping = Some(Mapping::AngleMapping(
            crate::proto::dmx_fixture_definition::channel::AngleMapping {
                min_degrees: 0,
                max_degrees: 540,
            },
        ));
        mode.channels.insert(0, pan_channel);

        // Add tilt channel at index 1 (0-270 degrees)
        let mut tilt_channel = Channel::default();
        tilt_channel.r#type = "tilt".to_string();
        tilt_channel.mapping = Some(Mapping::AngleMapping(
            crate::proto::dmx_fixture_definition::channel::AngleMapping {
                min_degrees: 0,
                max_degrees: 270,
            },
        ));
        mode.channels.insert(1, tilt_channel);

        fixture_def.modes.insert("test-mode".to_string(), mode);

        // Create fixture definitions map
        let mut fixture_definitions = HashMap::new();
        fixture_definitions.insert(1u64, fixture_def);

        // Create a physical fixture at channel 10
        let mut physical_fixture = PhysicalDmxFixture::default();
        physical_fixture.name = "Test Moving Head 1".to_string();
        physical_fixture.fixture_definition_id = 1;
        physical_fixture.fixture_mode = "test-mode".to_string();
        physical_fixture.channel_offset = 10;

        // Create output with the fixture
        let mut output = SerialDmxOutput::default();
        output.fixtures.insert(100u64, physical_fixture);

        // Create render target
        let mut render_target = DmxRenderTarget::new(&output, &fixture_definitions);

        // Create a fixture state with pan at 270 degrees and tilt at 135 degrees
        let mut state = FixtureState::default();
        state.pan = Some(270.0); // Half of 540 = 50%
        state.tilt = Some(135.0); // Half of 270 = 50%

        let qualified_id = QualifiedFixtureId {
            patch: 0,
            output: 123,
            fixture: 100,
        };

        // Create a color palette
        let color_palette = ColorPalette::default();

        // Apply the state
        render_target.apply_state(&qualified_id, &state, &color_palette);

        // Get the universe
        let universe = render_target.get_universe();

        // Pan channel (10) should be at 50% (127/128)
        assert!(
            universe[10] >= 127 && universe[10] <= 128,
            "Expected pan at ~127-128, got {}",
            universe[10]
        );

        // Tilt channel (11) should be at 50% (127/128)
        assert!(
            universe[11] >= 127 && universe[11] <= 128,
            "Expected tilt at ~127-128, got {}",
            universe[11]
        );

        // All other channels should be 0
        for i in 0..10 {
            assert_eq!(universe[i], 0, "Channel {} should be 0", i);
        }
        for i in 12..512 {
            assert_eq!(universe[i], 0, "Channel {} should be 0", i);
        }
    }
}
