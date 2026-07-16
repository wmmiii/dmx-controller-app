use crate::{
    beat::track_beat_at_time,
    palette::DEFAULT_COLOR_PALETTE,
    proto::{Effect, Project, render_mode::timecoded_show::State, timecoded_show::AudioTrack},
    render::{render_target::RenderTarget, util::apply_effect},
};

pub fn render_timecoded_show<T: RenderTarget<T>>(
    show_id: u64,
    render_target: &mut T,
    state: &State,
    system_t: u64,
    frame: u32,
    project: &Project,
) -> Result<(), String> {
    let show = project
        .shows
        .get(&show_id)
        .ok_or("Cannot find timecoded show to render!")?;

    let Some(AudioTrack { track_id }) = show.audio_track else {
        return Ok(());
    };

    let Some(track) = project.tracks.get(&track_id) else {
        return Err("Cannot find track!".to_string());
    };

    let t = match state {
        State::StartT(t) => u32::try_from(system_t - t).map_err(|e| e.to_string())?,
        State::PausedMs(t) => *t,
    };

    let beat_t = track_beat_at_time(track, f64::from(t)).unwrap_or(0.0);

    for output in show.outputs.iter().rev() {
        let Some(output_target) = &output.output_target else {
            continue;
        };
        let layer = output.layer.as_ref().ok_or("Output without layer!")?;
        for effect in &layer.effects {
            if effect.start_ms <= t
                && effect.end_ms > t
                && let Some(Effect { effect: Some(e) }) = &effect.effect
            {
                apply_effect(
                    project,
                    render_target,
                    output_target,
                    u64::from(t),
                    Some(
                        (f64::from(t) - f64::from(effect.start_ms))
                            / f64::from(effect.end_ms - effect.start_ms),
                    )
                    .as_ref(),
                    beat_t,
                    frame,
                    e,
                    &show
                        .color_palette
                        .clone()
                        .unwrap_or_else(|| DEFAULT_COLOR_PALETTE.clone()),
                );
            }
        }
    }

    Ok(())
}
