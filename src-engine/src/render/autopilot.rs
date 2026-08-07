use crate::{
    beat::effective_beat_metadata,
    hash::hash64,
    palette::interpolate_palettes,
    proto::{
        ColorPalette, Effect, Pattern, Playlist, Project, TargetedEffect,
        playlist::{self, Hold},
    },
    render::{render_target::RenderTarget, util::apply_effect},
};

pub fn render_playlist<T: RenderTarget<T>>(
    playlist_id: u64,
    render_target: &mut T,
    system_t: u64,
    frame: u32,
    project: &Project,
) -> Result<(), String> {
    let Some(playlist) = project.playlists.get(&playlist_id) else {
        return Err(format!("Could not find playlist {playlist_id}"));
    };

    let Some(beat_metadata) = effective_beat_metadata(project, system_t) else {
        return Err("Live beat not set!".to_string());
    };

    #[allow(clippy::cast_precision_loss)]
    let beat_t = (system_t - beat_metadata.offset_ms) as f64 / beat_metadata.length_ms;

    // Calculate color palette
    let palette_order = resolve_palette_order(playlist)?;
    let (palette_running_index, palette_ms) = playlist_index(
        playlist.palette_offset_ms,
        playlist.dwell_ms,
        playlist.transition_ms,
        system_t,
    )?;
    let palette_selection = select(
        &palette_order,
        playlist.palettes.len(),
        palette_running_index,
        palette_ms,
        playlist.dwell_ms,
        playlist.transition_ms,
    );
    let curr_palette = &playlist.palettes[palette_selection.curr_index];
    let color_palette = match palette_selection.transition {
        Some(amount) => interpolate_palettes(
            curr_palette,
            &playlist.palettes[palette_selection.next_index],
            amount,
        ),
        None => curr_palette.clone(),
    };

    // Calculate pattern
    let pattern_order = resolve_pattern_order(playlist)?;
    let (pattern_running_index, pattern_ms) = playlist_index(
        playlist.pattern_offset_ms,
        playlist.dwell_ms,
        playlist.transition_ms,
        system_t,
    )?;
    let pattern_selection = select(
        &pattern_order,
        playlist.patterns.len(),
        pattern_running_index,
        pattern_ms,
        playlist.dwell_ms,
        playlist.transition_ms,
    );
    let curr_pattern = &playlist.patterns[pattern_selection.curr_index];
    let next_pattern = &playlist.patterns[pattern_selection.next_index];

    // Render
    if let Some(amount) = pattern_selection.transition {
        let mut curr_target = render_target.clone();
        render_pattern(
            curr_pattern,
            &color_palette,
            &mut curr_target,
            system_t,
            beat_t,
            frame,
            project,
        );
        let mut next_target = render_target.clone();
        render_pattern(
            next_pattern,
            &color_palette,
            &mut next_target,
            system_t,
            beat_t,
            frame,
            project,
        );
        render_target.interpolate(&curr_target, &next_target, amount);
    } else {
        render_pattern(
            curr_pattern,
            &color_palette,
            render_target,
            system_t,
            beat_t,
            frame,
            project,
        );
    }

    Ok(())
}

/// Selected current/next item within a playlist collection, plus the crossfade
/// amount when transitioning (`None` while holding on the current item).
struct Selection {
    curr_index: usize,
    next_index: usize,
    transition: Option<f64>,
}

/// A playlist ordering mode with any `Hold` target already resolved to a slice
/// index. Shared by the native render path and the parts-based WASM entry point.
enum ResolvedOrder {
    Hold(usize),
    Sequential,
    Shuffle,
}

/// Order kind discriminants shared with the WASM boundary.
const ORDER_HOLD: u8 = 0;
const ORDER_SEQUENTIAL: u8 = 1;
const ORDER_SHUFFLE: u8 = 2;

fn select(
    order: &ResolvedOrder,
    len: usize,
    running_index: u64,
    ms: u32,
    dwell_ms: u32,
    transition_ms: u32,
) -> Selection {
    if let ResolvedOrder::Hold(index) = order {
        return Selection {
            curr_index: *index,
            next_index: *index,
            transition: None,
        };
    }
    let (curr_index, next_index) = match order {
        ResolvedOrder::Sequential => (
            wrap_index(running_index, len),
            wrap_index(running_index + 1, len),
        ),
        ResolvedOrder::Shuffle => (
            wrap_index(hash64(running_index), len),
            wrap_index(hash64(running_index + 1), len),
        ),
        ResolvedOrder::Hold(_) => unreachable!("handled above"),
    };
    let transition = if ms > dwell_ms {
        Some(f64::from(ms - dwell_ms) / f64::from(transition_ms))
    } else {
        None
    };
    Selection {
        curr_index,
        next_index,
        transition,
    }
}

/// Active selection reported across the WASM boundary. `position_ms` is how far
/// into the current dwell+transition cycle we are, so the frontend can draw a
/// progress bar under the active item.
pub struct PlaylistSelection {
    pub curr_index: u32,
    pub next_index: u32,
    pub transition: Option<f64>,
    pub position_ms: u32,
}

/// Computes the active selection from raw scalars, without a decoded playlist.
/// Exposed through WASM so the frontend can highlight the active pattern/palette
/// without an IPC round-trip; `hold_index` is used only when `order_kind` is Hold.
pub fn active_playlist_selection(
    order_kind: u8,
    hold_index: u32,
    len: u32,
    offset_ms: i64,
    dwell_ms: u32,
    transition_ms: u32,
    system_t: u64,
) -> Result<PlaylistSelection, String> {
    let order = match order_kind {
        ORDER_HOLD => ResolvedOrder::Hold(hold_index as usize),
        ORDER_SEQUENTIAL => ResolvedOrder::Sequential,
        ORDER_SHUFFLE => ResolvedOrder::Shuffle,
        _ => return Err(format!("Unknown playlist order kind {order_kind}")),
    };
    let (running_index, ms) = playlist_index(offset_ms, dwell_ms, transition_ms, system_t)?;
    let selection = select(
        &order,
        len as usize,
        running_index,
        ms,
        dwell_ms,
        transition_ms,
    );
    #[allow(clippy::cast_possible_truncation)]
    Ok(PlaylistSelection {
        curr_index: selection.curr_index as u32,
        next_index: selection.next_index as u32,
        transition: selection.transition,
        position_ms: ms,
    })
}

fn resolve_pattern_order(playlist: &Playlist) -> Result<ResolvedOrder, String> {
    match playlist
        .pattern_order
        .as_ref()
        .ok_or("Pattern order not set")?
    {
        playlist::PatternOrder::PatternHold(Hold { id }) => Ok(ResolvedOrder::Hold(
            playlist
                .patterns
                .iter()
                .position(|p| p.id == *id)
                .ok_or("Held playlist item not found")?,
        )),
        playlist::PatternOrder::PatternSequential(_) => Ok(ResolvedOrder::Sequential),
        playlist::PatternOrder::PatternShuffle(_) => Ok(ResolvedOrder::Shuffle),
    }
}

fn resolve_palette_order(playlist: &Playlist) -> Result<ResolvedOrder, String> {
    match playlist
        .palette_order
        .as_ref()
        .ok_or("Palette order not set")?
    {
        playlist::PaletteOrder::PaletteHold(Hold { id }) => Ok(ResolvedOrder::Hold(
            playlist
                .palettes
                .iter()
                .position(|p| p.id == *id)
                .ok_or("Held playlist item not found")?,
        )),
        playlist::PaletteOrder::PaletteSequential(_) => Ok(ResolvedOrder::Sequential),
        playlist::PaletteOrder::PaletteShuffle(_) => Ok(ResolvedOrder::Shuffle),
    }
}

fn playlist_index(
    offset: i64,
    dwell_ms: u32,
    transition_ms: u32,
    t: u64,
) -> Result<(u64, u32), String> {
    #[allow(clippy::cast_possible_wrap)]
    let t_offset = t as i64 - offset;
    if t_offset < 0 {
        return Ok((0, 0));
    }

    let total_duration = dwell_ms + transition_ms;
    if total_duration == 0 {
        return Err("Playlist dwell and transition not set".to_string());
    }

    let t_offset = u64::try_from(t_offset).map_err(|e| e.to_string())?;
    let total = u64::from(total_duration);
    Ok((
        t_offset / total,
        u32::try_from(t_offset % total).map_err(|e| e.to_string())?,
    ))
}

// Wraps a running index into a slice; `value % len` is always < len, so the
// downcast to usize cannot truncate.
#[allow(clippy::cast_possible_truncation)]
fn wrap_index(value: u64, len: usize) -> usize {
    (value % len as u64) as usize
}

fn render_pattern<T: RenderTarget<T>>(
    pattern: &Pattern,
    palette: &ColorPalette,
    render_target: &mut T,
    system_t: u64,
    beat_t: f64,
    frame: u32,
    project: &Project,
) {
    for targeted_effect in &pattern.targeted_effects {
        if let TargetedEffect {
            effect:
                Some(Effect {
                    effect: Some(effect),
                    ..
                }),
            output_target: Some(output_target),
        } = targeted_effect
        {
            apply_effect(
                project,
                render_target,
                output_target,
                system_t,
                None,
                beat_t,
                frame,
                effect,
                palette,
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // dwell 1000ms + transition 200ms => 1200ms cycle, offset 0.
    const DWELL: u32 = 1000;
    const TRANSITION: u32 = 200;
    const CYCLE: u64 = (DWELL + TRANSITION) as u64;

    fn selection(order_kind: u8, hold_index: u32, len: u32, t: u64) -> PlaylistSelection {
        active_playlist_selection(order_kind, hold_index, len, 0, DWELL, TRANSITION, t).unwrap()
    }

    #[test]
    fn hold_always_returns_held_index_without_transition() {
        // Even deep into a transition window, Hold pins current == next and never crossfades.
        let s = selection(ORDER_HOLD, 2, 5, 3 * CYCLE + u64::from(DWELL) + 100);
        assert_eq!((s.curr_index, s.next_index), (2, 2));
        assert!(s.transition.is_none());
    }

    #[test]
    fn sequential_advances_and_wraps_past_len() {
        // Fourth cycle of a 3-item list wraps back to index 0, next to 1.
        let s = selection(ORDER_SEQUENTIAL, 0, 3, 3 * CYCLE + 10);
        assert_eq!((s.curr_index, s.next_index), (0, 1));
    }

    #[test]
    fn shuffle_matches_hashed_index() {
        let running_index = 5;
        let len = 4;
        let s = selection(ORDER_SHUFFLE, 0, len, running_index * CYCLE + 10);
        assert_eq!(
            s.curr_index as usize,
            wrap_index(hash64(running_index), len as usize)
        );
        assert_eq!(
            s.next_index as usize,
            wrap_index(hash64(running_index + 1), len as usize)
        );
    }

    #[test]
    fn transition_only_after_dwell() {
        let holding = selection(ORDER_SEQUENTIAL, 0, 3, u64::from(DWELL) - 1);
        assert!(holding.transition.is_none());
        assert_eq!(holding.position_ms, DWELL - 1);

        let crossfading = selection(ORDER_SEQUENTIAL, 0, 3, u64::from(DWELL) + 100);
        let amount = crossfading.transition.unwrap();
        assert!((0.0..1.0).contains(&amount));
        assert_eq!(crossfading.position_ms, DWELL + 100);
    }

    #[test]
    fn unknown_order_kind_errors() {
        assert!(active_playlist_selection(9, 0, 3, 0, DWELL, TRANSITION, 0).is_err());
    }
}
