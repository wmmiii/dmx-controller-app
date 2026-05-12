#![allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]

use crate::proto::{
    DisplayBuffer, PhysicalSegment, VirtualMapping,
    physical_segment::{self, Line, Rectangle, rectangle::StripStart},
    virtual_mapping::Rotate,
};

/// Maps pixels from a display buffer to a physical segment's pixel layout.
/// Returns RGB floats in the order the physical LEDs expect them.
///
/// # Arguments
/// * `buffer` - The rendered pixel buffer
/// * `mapping` - The mapping that describes the offset and transformation
/// * `segment` - The physical segment definition (Line or Rectangle)
///
/// # Returns
/// RGB floats (3 floats per pixel) in physical LED order
#[must_use]
pub fn map_segment_to_rgb(
    buffer: &DisplayBuffer,
    mapping: &VirtualMapping,
    segment: &PhysicalSegment,
) -> Vec<f32> {
    let positions = iter_segment_positions(segment);
    let mut floats = Vec::with_capacity(positions.len() * 3);

    for (phys_x, phys_y) in positions {
        let (virt_x, virt_y) = transform_to_virtual(phys_x, phys_y, mapping, segment);

        let (r, g, b) = buffer.sample(virt_x, virt_y).unwrap_or((0.0, 0.0, 0.0));

        floats.push(r);
        floats.push(g);
        floats.push(b);
    }

    floats
}

/// Iterate physical pixel positions in the order LEDs are wired.
fn iter_segment_positions(segment: &PhysicalSegment) -> Vec<(u32, u32)> {
    match &segment.shape {
        Some(physical_segment::Shape::Line(line)) => iter_line_positions(*line),
        Some(physical_segment::Shape::Rectangle(rect)) => iter_rectangle_positions(rect),
        None => Vec::new(),
    }
}

/// Line segment: pixels at (0,0), (1,0), (2,0), ... (length-1, 0)
fn iter_line_positions(line: Line) -> Vec<(u32, u32)> {
    (0..line.length).map(|x| (x, 0)).collect()
}

/// Rectangle segment: iterate pixels respecting `strip_start`, vertical, serpentine.
fn iter_rectangle_positions(rect: &Rectangle) -> Vec<(u32, u32)> {
    let width = rect.width;
    let height = rect.height;

    if width == 0 || height == 0 {
        return Vec::new();
    }

    let mut positions = Vec::with_capacity((width * height) as usize);

    // Determine primary and secondary axis based on vertical flag
    let (primary_size, secondary_size) = if rect.vertical {
        (width, height) // Primary = columns (x), Secondary = rows within column (y)
    } else {
        (height, width) // Primary = rows (y), Secondary = columns within row (x)
    };

    // Determine starting direction based on strip_start
    let (start_primary_at_end, start_secondary_at_end) = match rect.strip_start() {
        StripStart::UpperLeft => (false, false), // Start at row 0, col 0
        StripStart::UpperRight => (false, true), // Start at row 0, col width-1
        StripStart::LowerRight => (true, true),  // Start at row height-1, col width-1
        StripStart::LowerLeft => (true, false),  // Start at row height-1, col 0
    };

    for primary_idx in 0..primary_size {
        // Determine if we should reverse secondary iteration (serpentine)
        let reverse_secondary = rect.serpentine && (primary_idx % 2 == 1);

        // Calculate actual primary coordinate
        let actual_primary = if start_primary_at_end {
            primary_size - 1 - primary_idx
        } else {
            primary_idx
        };

        for secondary_idx in 0..secondary_size {
            // Calculate actual secondary coordinate (XOR: flip if exactly one condition is true)
            let actual_secondary = if start_secondary_at_end ^ reverse_secondary {
                secondary_size - 1 - secondary_idx
            } else {
                secondary_idx
            };

            // Convert back to (x, y) based on vertical flag
            let (x, y) = if rect.vertical {
                (actual_primary, actual_secondary)
            } else {
                (actual_secondary, actual_primary)
            };

            positions.push((x, y));
        }
    }

    positions
}

/// Transform physical segment coordinates to virtual display coordinates.
/// Applies offset, rotation, and flip transformations.
/// Returns signed coordinates since offsets can be negative for alignment.
fn transform_to_virtual(
    physical_x: u32,
    physical_y: u32,
    mapping: &VirtualMapping,
    segment: &PhysicalSegment,
) -> (i32, i32) {
    // Get segment dimensions for rotation/flip
    let (seg_width, seg_height) = get_segment_dimensions(segment);

    // Apply flip first (in physical space)
    let (flipped_x, flipped_y) = apply_flip(
        physical_x,
        physical_y,
        seg_width,
        seg_height,
        mapping.flip_horizontally,
        mapping.flip_vertically,
    );

    // Apply rotation
    let (rotated_x, rotated_y) = apply_rotation(
        flipped_x,
        flipped_y,
        seg_width,
        seg_height,
        mapping.rotate(),
    );

    // Apply offset to get virtual coordinates (offset is signed)
    let virtual_x = mapping.left + rotated_x as i32;
    let virtual_y = mapping.top + rotated_y as i32;

    (virtual_x, virtual_y)
}

fn get_segment_dimensions(segment: &PhysicalSegment) -> (u32, u32) {
    match &segment.shape {
        Some(physical_segment::Shape::Line(line)) => (line.length, 1),
        Some(physical_segment::Shape::Rectangle(rect)) => (rect.width, rect.height),
        None => (0, 0),
    }
}

fn apply_flip(x: u32, y: u32, width: u32, height: u32, flip_h: bool, flip_v: bool) -> (u32, u32) {
    let new_x = if flip_h && width > 0 {
        width - 1 - x
    } else {
        x
    };
    let new_y = if flip_v && height > 0 {
        height - 1 - y
    } else {
        y
    };
    (new_x, new_y)
}

fn apply_rotation(x: u32, y: u32, width: u32, height: u32, rotate: Rotate) -> (u32, u32) {
    match rotate {
        Rotate::Deg0 => (x, y),
        Rotate::Deg90 => {
            // 90 degrees clockwise: (x, y) -> (height - 1 - y, x)
            if height > 0 {
                (height - 1 - y, x)
            } else {
                (0, x)
            }
        }
        Rotate::Deg180 => {
            // 180 degrees: (x, y) -> (width - 1 - x, height - 1 - y)
            let new_x = if width > 0 { width - 1 - x } else { 0 };
            let new_y = if height > 0 { height - 1 - y } else { 0 };
            (new_x, new_y)
        }
        Rotate::Deg270 => {
            // 270 degrees clockwise (90 counter): (x, y) -> (y, width - 1 - x)
            if width > 0 {
                (y, width - 1 - x)
            } else {
                (y, 0)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_line_segment(length: u32) -> PhysicalSegment {
        PhysicalSegment {
            shape: Some(physical_segment::Shape::Line(Line { length })),
        }
    }

    fn make_rect_segment(
        width: u32,
        height: u32,
        strip_start: i32,
        vertical: bool,
        serpentine: bool,
    ) -> PhysicalSegment {
        PhysicalSegment {
            shape: Some(physical_segment::Shape::Rectangle(Rectangle {
                width,
                height,
                strip_start,
                vertical,
                serpentine,
            })),
        }
    }

    #[test]
    fn test_line_positions() {
        let segment = make_line_segment(5);
        let positions = iter_segment_positions(&segment);
        assert_eq!(positions, vec![(0, 0), (1, 0), (2, 0), (3, 0), (4, 0)]);
    }

    #[test]
    fn test_rect_upper_left_horizontal() {
        // 3x2 rectangle, start upper-left, horizontal, no serpentine
        let segment = make_rect_segment(3, 2, StripStart::UpperLeft as i32, false, false);
        let positions = iter_segment_positions(&segment);
        // Row 0: (0,0), (1,0), (2,0)
        // Row 1: (0,1), (1,1), (2,1)
        assert_eq!(
            positions,
            vec![(0, 0), (1, 0), (2, 0), (0, 1), (1, 1), (2, 1)]
        );
    }

    #[test]
    fn test_rect_upper_left_horizontal_serpentine() {
        // 3x2 rectangle, start upper-left, horizontal, serpentine
        let segment = make_rect_segment(3, 2, StripStart::UpperLeft as i32, false, true);
        let positions = iter_segment_positions(&segment);
        // Row 0: (0,0), (1,0), (2,0) - forward
        // Row 1: (2,1), (1,1), (0,1) - reversed
        assert_eq!(
            positions,
            vec![(0, 0), (1, 0), (2, 0), (2, 1), (1, 1), (0, 1)]
        );
    }

    #[test]
    fn test_rect_lower_right_horizontal_serpentine() {
        // 3x2 rectangle, start lower-right, horizontal, serpentine
        let segment = make_rect_segment(3, 2, StripStart::LowerRight as i32, false, true);
        let positions = iter_segment_positions(&segment);
        // Primary starts at end (row 1), secondary starts at end (col 2)
        // Row 1: (2,1), (1,1), (0,1) - forward from end
        // Row 0: (0,0), (1,0), (2,0) - reversed (serpentine)
        assert_eq!(
            positions,
            vec![(2, 1), (1, 1), (0, 1), (0, 0), (1, 0), (2, 0)]
        );
    }

    #[test]
    fn test_map_segment_solid_color() {
        let mut buffer = DisplayBuffer::new(0, 4, 4);
        // Fill with red
        for y in 0..4 {
            for x in 0..4 {
                buffer.set(x, y, 1.0, 0.0, 0.0);
            }
        }

        let mapping = VirtualMapping {
            top: 0,
            left: 0,
            rotate: Rotate::Deg0 as i32,
            flip_horizontally: false,
            flip_vertically: false,
        };

        let segment = make_line_segment(3);
        let floats = map_segment_to_rgb(&buffer, &mapping, &segment);

        // 3 pixels, each RGB (1.0, 0.0, 0.0)
        assert_eq!(floats, vec![1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0]);
    }

    #[test]
    fn test_map_segment_with_offset() {
        let mut buffer = DisplayBuffer::new(0, 4, 4);
        // Set pixel at (2, 1) to green
        buffer.set(2, 1, 0.0, 1.0, 0.0);

        let mapping = VirtualMapping {
            top: 1,
            left: 2,
            rotate: Rotate::Deg0 as i32,
            flip_horizontally: false,
            flip_vertically: false,
        };

        let segment = make_line_segment(1);
        let floats = map_segment_to_rgb(&buffer, &mapping, &segment);

        // Pixel at physical (0,0) maps to virtual (2,1) which is green
        assert_eq!(floats, vec![0.0, 1.0, 0.0]);
    }

    #[test]
    fn test_out_of_bounds_returns_black() {
        let buffer = DisplayBuffer::new(0, 2, 2);

        let mapping = VirtualMapping {
            top: 10, // Way out of bounds
            left: 10,
            rotate: Rotate::Deg0 as i32,
            flip_horizontally: false,
            flip_vertically: false,
        };

        let segment = make_line_segment(3);
        let floats = map_segment_to_rgb(&buffer, &mapping, &segment);

        // All black
        assert_eq!(floats, vec![0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn test_negative_offset_partial_visible() {
        let mut buffer = DisplayBuffer::new(0, 4, 4);
        // Set pixels at row 0 to different colors
        buffer.set(0, 0, 1.0, 0.0, 0.0); // red
        buffer.set(1, 0, 0.0, 1.0, 0.0); // green
        buffer.set(2, 0, 0.0, 0.0, 1.0); // blue

        // Place a 4-pixel line at left=-2, so first 2 pixels are off-screen
        let mapping = VirtualMapping {
            top: 0,
            left: -2,
            rotate: Rotate::Deg0 as i32,
            flip_horizontally: false,
            flip_vertically: false,
        };

        let segment = make_line_segment(4);
        let floats = map_segment_to_rgb(&buffer, &mapping, &segment);

        // Physical pixels 0,1 map to virtual (-2,0), (-1,0) -> black
        // Physical pixels 2,3 map to virtual (0,0), (1,0) -> red, green
        assert_eq!(
            floats,
            vec![
                0.0, 0.0, 0.0, // black (off-screen)
                0.0, 0.0, 0.0, // black (off-screen)
                1.0, 0.0, 0.0, // red
                0.0, 1.0, 0.0, // green
            ]
        );
    }
}
