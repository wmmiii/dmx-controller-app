mod events;

use clap::{Parser, Subcommand};
use dmx_engine::project;
use dmx_engine::proto::playlist::{Hold, PaletteOrder, PatternOrder, Sequential, Shuffle};
use dmx_engine::proto::render_mode::{Autopilot, Blackout, Mode};
use dmx_engine::proto::{self, FatProject, Playlist, Project};
use dmx_engine::render::render::RENDER_MODE_REF;
use dmx_runtime::runtime::{Runtime, RuntimeConfig};
use log::LevelFilter;
use prost::Message;
use std::env;
use std::format;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

use crate::events::LogEventSink;

/// Long enough for every output loop to push at least one blacked-out frame at
/// the default rates before the loops are torn down.
const BLACKOUT_DRAIN: Duration = Duration::from_millis(250);

/// Renders a DMX Controller App project without a display, for unattended installs.
#[derive(Parser)]
#[command(name = "dmx-controller-app-headless", version)]
struct Args {
    /// Path to a .dmxapp project exported from the desktop app.
    #[arg(long, value_name = "PATH")]
    project: PathBuf,

    /// Manually select which patch to output to.
    #[arg(long)]
    patch: Option<String>,

    #[command(subcommand)]
    mode: RenderModeArgs,

    /// Minimum level to log. The RUST_LOG env filter refines it per module.
    #[arg(long, default_value = "info", value_name = "LEVEL")]
    #[allow(clippy::doc_markdown)]
    log_level: LevelFilter,

    /// Skip GPU initialization, disabling visualizer displays and DDP output.
    #[arg(long)]
    no_visualizer: bool,

    /// Skip audio capture, disabling audio-reactive effects and beat matching.
    #[arg(long)]
    no_audio: bool,

    /// Skip MIDI, disabling controller input.
    #[arg(long)]
    no_midi: bool,
}

#[derive(Subcommand)]
enum RenderModeArgs {
    /// Run in Autopilot mode, cycling through patterns/palettes.
    Autopilot(AutopilotArgs),
}

#[derive(Parser, Default)]
#[allow(clippy::struct_excessive_bools)]
struct AutopilotArgs {
    /// Override the playlist's pattern order to hold on one pattern.
    #[arg(long, value_name = "PATTERN_ID", group = "pattern_order")]
    pattern_hold: Option<u64>,

    /// Override the playlist's pattern order to cycle sequentially through patterns.
    #[arg(long, group = "pattern_order")]
    pattern_sequential: bool,

    /// Override the playlist's pattern order to shuffle through patterns.
    #[arg(long, group = "pattern_order")]
    pattern_shuffle: bool,

    /// Override the playlist's palette order to hold on one palette.
    #[arg(long, value_name = "PALETTE_ID", group = "palette_order")]
    palette_hold: Option<u64>,

    /// Override the playlist's palette order to cycle sequentially through palettes.
    #[arg(long, group = "palette_order")]
    palette_sequential: bool,

    /// Override the playlist's palette order to shuffle through palettes.
    #[arg(long, group = "palette_order")]
    palette_shuffle: bool,
}

#[tokio::main(flavor = "multi_thread")]
async fn main() -> ExitCode {
    let args = Args::parse();

    env_logger::Builder::new()
        .filter_level(args.log_level)
        // wgpu and naga log adapter and instance details at Info on every
        // device init, which floods the log.
        .filter_module("wgpu", LevelFilter::Warn)
        .filter_module("wgpu_core", LevelFilter::Warn)
        .filter_module("wgpu_hal", LevelFilter::Warn)
        .filter_module("naga", LevelFilter::Warn)
        .parse_default_env()
        .init();

    match run(args).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            log::error!("{e}");
            ExitCode::FAILURE
        }
    }
}

async fn run(args: Args) -> Result<(), String> {
    let project_path = expand_home(&args.project)?;
    let mut project = read_project(&project_path)?;
    if let Some(patch_name) = args.patch {
        set_patch(&mut project, &patch_name)?;
    }

    let render_mode = resolve_render_mode(&args.mode, &mut project)?;

    project::load(project)?;
    set_render_mode(render_mode)?;

    #[cfg(feature = "audio")]
    if !args.no_audio {
        dmx_runtime::audio_input::suppress_audio_lib_errors();
    }

    let runtime = Runtime::start(RuntimeConfig {
        events: Arc::new(LogEventSink::default()),
        persist: None,
        enable_visualizer: !args.no_visualizer,
        enable_audio: !args.no_audio,
        enable_midi: !args.no_midi,
    })
    .await?;

    wait_for_shutdown_signal().await;

    log::info!("Shutting down, blacking out outputs");
    set_render_mode(Mode::Blackout(Blackout {}))?;
    tokio::time::sleep(BLACKOUT_DRAIN).await;

    runtime.shutdown().await
}

fn read_project(path: &Path) -> Result<Project, String> {
    let file_bytes =
        std::fs::read(path).map_err(|e| format!("Failed to read {}: {e}", path.display()))?;

    let fat_project = FatProject::decode(file_bytes.as_slice()).map_err(|e| {
        format!(
            "Failed to decode {} as a .dmxapp project: {e}",
            path.display()
        )
    })?;

    let project = fat_project
        .project
        .ok_or_else(|| format!("{} contains no project", path.display()))?;

    log::info!("Loaded project \"{}\"", project.name);

    Ok(project)
}

fn resolve_render_mode(mode: &RenderModeArgs, project: &mut Project) -> Result<Mode, String> {
    match mode {
        RenderModeArgs::Autopilot(autopilot_args) => {
            let playlist_id = project.active_playlist;
            if playlist_id == 0 {
                return Err(
                    "Project has no active playlist. Open it in the desktop app, select a playlist, and export again."
                        .to_string(),
                );
            }

            let playlist = project
                .playlists
                .get_mut(&playlist_id)
                .ok_or_else(|| format!("Active playlist {playlist_id} is not in the project"))?;

            if let Some(order) = pattern_order_override(autopilot_args, playlist)? {
                playlist.pattern_order = Some(order);
            }
            if let Some(order) = palette_order_override(autopilot_args, playlist)? {
                playlist.palette_order = Some(order);
            }

            log::info!("Autopilot playlist \"{}\"", playlist.name);

            Ok(Mode::Autopilot(Autopilot { playlist_id }))
        }
    }
}

fn pattern_order_override(
    args: &AutopilotArgs,
    playlist: &Playlist,
) -> Result<Option<PatternOrder>, String> {
    if let Some(id) = args.pattern_hold {
        if playlist.patterns.iter().any(|p| p.id == id) {
            return Ok(Some(PatternOrder::PatternHold(Hold { id })));
        }
        let available = playlist
            .patterns
            .iter()
            .map(|p| format!("\"{}\" ({})", p.name, p.id))
            .collect::<Vec<_>>()
            .join(", ");
        return Err(format!(
            "Pattern {id} does not exist.\nAvailable patterns: {available}"
        ));
    }

    if args.pattern_sequential {
        return Ok(Some(PatternOrder::PatternSequential(Sequential {})));
    }

    if args.pattern_shuffle {
        return Ok(Some(PatternOrder::PatternShuffle(Shuffle {})));
    }

    Ok(None)
}

fn palette_order_override(
    args: &AutopilotArgs,
    playlist: &Playlist,
) -> Result<Option<PaletteOrder>, String> {
    if let Some(id) = args.palette_hold {
        if playlist.palettes.iter().any(|p| p.id == id) {
            return Ok(Some(PaletteOrder::PaletteHold(Hold { id })));
        }
        let available = playlist
            .palettes
            .iter()
            .map(|p| format!("{} ({})", p.name, p.id))
            .collect::<Vec<_>>()
            .join(", ");
        return Err(format!(
            "Palette {id} does not exist.\nAvailable palettes: {available}"
        ));
    }

    if args.palette_sequential {
        return Ok(Some(PaletteOrder::PaletteSequential(Sequential {})));
    }

    if args.palette_shuffle {
        return Ok(Some(PaletteOrder::PaletteShuffle(Shuffle {})));
    }

    Ok(None)
}

fn expand_home(path: &Path) -> Result<PathBuf, String> {
    let path_str = path.to_string_lossy();
    if path_str.starts_with("~/") || path_str == "~" {
        let home = env::var("HOME")
            .map_err(|_| "Cannot expand ~: HOME environment variable not set".to_string())?;
        let expanded = if path_str == "~" {
            PathBuf::from(home)
        } else {
            PathBuf::from(home).join(&path_str[2..])
        };
        Ok(expanded)
    } else {
        Ok(path.to_path_buf())
    }
}

fn set_render_mode(mode: Mode) -> Result<(), String> {
    let mut render_mode = RENDER_MODE_REF
        .lock()
        .map_err(|e| format!("Failed to lock render mode: {e}"))?;
    *render_mode = proto::RenderMode { mode: Some(mode) };

    Ok(())
}

fn set_patch(project: &mut Project, patch_name: &str) -> Result<(), String> {
    if let Some((i, _p)) = project.patches.iter().find(|(_i, p)| patch_name == p.name) {
        project.active_patch = *i;
        log::info!("Using patch \"{patch_name}\" ({i})");
        Ok(())
    } else {
        let patch_list = project
            .patches
            .values()
            .map(|p| p.name.clone())
            .collect::<Vec<String>>()
            .join("\", \"");
        Err(format!(
            "Patch \"{patch_name}\" does not exist.\nAvailable patches are: \"{patch_list}\""
        ))
    }
}

#[cfg(unix)]
async fn wait_for_shutdown_signal() {
    use tokio::signal::unix::{SignalKind, signal};

    let mut terminate = match signal(SignalKind::terminate()) {
        Ok(terminate) => terminate,
        Err(e) => {
            log::warn!("Failed to listen for SIGTERM: {e}");
            wait_for_ctrl_c().await;
            return;
        }
    };

    tokio::select! {
        () = wait_for_ctrl_c() => {}
        _ = terminate.recv() => {}
    }
}

#[cfg(not(unix))]
async fn wait_for_shutdown_signal() {
    wait_for_ctrl_c().await;
}

async fn wait_for_ctrl_c() {
    if let Err(e) = tokio::signal::ctrl_c().await {
        log::error!("Failed to listen for shutdown signal: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use dmx_engine::proto::Playlist;
    use std::collections::HashMap;

    struct Fixture(PathBuf);

    impl Fixture {
        fn new(name: &str, bytes: &[u8]) -> Self {
            let path = std::env::temp_dir().join(format!("dmx-headless-{name}.dmxapp"));
            std::fs::write(&path, bytes).unwrap();
            Self(path)
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }

    fn project_with_playlist(playlist_id: u64) -> Project {
        Project {
            name: "Test Show".to_string(),
            playlists: HashMap::from([(
                playlist_id,
                Playlist {
                    name: "Main".to_string(),
                    ..Default::default()
                },
            )]),
            active_playlist: playlist_id,
            ..Default::default()
        }
    }

    #[test]
    fn expand_home_with_tilde_slash() {
        let result = expand_home(Path::new("~/test.txt")).unwrap();
        let home = env::var("HOME").unwrap();
        assert_eq!(result, PathBuf::from(format!("{}/test.txt", home)));
    }

    #[test]
    fn expand_home_with_tilde_only() {
        let result = expand_home(Path::new("~")).unwrap();
        let home = env::var("HOME").unwrap();
        assert_eq!(result, PathBuf::from(home));
    }

    #[test]
    fn expand_home_with_absolute_path() {
        let result = expand_home(Path::new("/absolute/path.txt")).unwrap();
        assert_eq!(result, PathBuf::from("/absolute/path.txt"));
    }

    #[test]
    fn expand_home_with_relative_path() {
        let result = expand_home(Path::new("relative/path.txt")).unwrap();
        assert_eq!(result, PathBuf::from("relative/path.txt"));
    }

    #[test]
    fn reports_a_missing_file() {
        let error = read_project(Path::new("/nonexistent/show.dmxapp")).unwrap_err();
        assert!(error.contains("Failed to read"), "{error}");
    }

    #[test]
    fn reports_an_absent_project() {
        let fixture = Fixture::new("absent-project", &FatProject::default().encode_to_vec());

        let error = read_project(&fixture.0).unwrap_err();
        assert!(error.contains("contains no project"), "{error}");
    }

    #[test]
    fn reads_back_the_stored_project() {
        let fixture = Fixture::new(
            "valid",
            &FatProject {
                project: Some(project_with_playlist(7)),
                cas: HashMap::new(),
            }
            .encode_to_vec(),
        );

        assert_eq!(read_project(&fixture.0), Ok(project_with_playlist(7)));
    }

    #[test]
    fn autopilot_reports_an_unset_active_playlist() {
        let mut project = Project {
            active_playlist: 0,
            ..project_with_playlist(7)
        };
        let mode = RenderModeArgs::Autopilot(AutopilotArgs::default());

        let error = resolve_render_mode(&mode, &mut project).unwrap_err();
        assert!(error.contains("no active playlist"), "{error}");
    }

    #[test]
    fn autopilot_reports_an_active_playlist_that_was_deleted() {
        let mut project = Project {
            playlists: HashMap::new(),
            ..project_with_playlist(7)
        };
        let mode = RenderModeArgs::Autopilot(AutopilotArgs::default());

        let error = resolve_render_mode(&mode, &mut project).unwrap_err();
        assert!(
            error.contains("Active playlist 7 is not in the project"),
            "{error}"
        );
    }

    #[test]
    fn autopilot_selects_the_active_playlist() {
        let mut project = project_with_playlist(7);
        let mode = RenderModeArgs::Autopilot(AutopilotArgs::default());

        assert_eq!(
            resolve_render_mode(&mode, &mut project),
            Ok(Mode::Autopilot(Autopilot { playlist_id: 7 }))
        );
    }

    #[test]
    fn pattern_hold_override_with_valid_id() {
        let mut project = {
            let mut p = project_with_playlist(1);
            let playlist = p.playlists.get_mut(&1).unwrap();
            playlist.patterns = vec![
                dmx_engine::proto::Pattern {
                    id: 10,
                    name: "Pattern A".to_string(),
                    ..Default::default()
                },
                dmx_engine::proto::Pattern {
                    id: 20,
                    name: "Pattern B".to_string(),
                    ..Default::default()
                },
            ];
            p
        };

        let mut args = AutopilotArgs::default();
        args.pattern_hold = Some(20);
        let mode = RenderModeArgs::Autopilot(args);

        assert_eq!(
            resolve_render_mode(&mode, &mut project),
            Ok(Mode::Autopilot(Autopilot { playlist_id: 1 }))
        );

        let playlist = project.playlists.get(&1).unwrap();
        assert!(matches!(
            playlist.pattern_order,
            Some(PatternOrder::PatternHold(Hold { id: 20 }))
        ));
    }

    #[test]
    fn pattern_hold_override_with_invalid_id() {
        let mut project = {
            let mut p = project_with_playlist(1);
            let playlist = p.playlists.get_mut(&1).unwrap();
            playlist.patterns = vec![dmx_engine::proto::Pattern {
                id: 10,
                name: "Pattern A".to_string(),
                ..Default::default()
            }];
            p
        };

        let mut args = AutopilotArgs::default();
        args.pattern_hold = Some(999);
        let mode = RenderModeArgs::Autopilot(args);

        let error = resolve_render_mode(&mode, &mut project).unwrap_err();
        assert!(error.contains("Pattern 999 does not exist"), "{error}");
        assert!(error.contains("Pattern A (10)"), "{error}");
    }

    #[test]
    fn pattern_sequential_override() {
        let mut project = project_with_playlist(1);

        let mut args = AutopilotArgs::default();
        args.pattern_sequential = true;
        let mode = RenderModeArgs::Autopilot(args);

        assert_eq!(
            resolve_render_mode(&mode, &mut project),
            Ok(Mode::Autopilot(Autopilot { playlist_id: 1 }))
        );

        let playlist = project.playlists.get(&1).unwrap();
        assert!(matches!(
            playlist.pattern_order,
            Some(PatternOrder::PatternSequential(_))
        ));
    }

    #[test]
    fn pattern_shuffle_override() {
        let mut project = project_with_playlist(1);

        let mut args = AutopilotArgs::default();
        args.pattern_shuffle = true;
        let mode = RenderModeArgs::Autopilot(args);

        assert_eq!(
            resolve_render_mode(&mode, &mut project),
            Ok(Mode::Autopilot(Autopilot { playlist_id: 1 }))
        );

        let playlist = project.playlists.get(&1).unwrap();
        assert!(matches!(
            playlist.pattern_order,
            Some(PatternOrder::PatternShuffle(_))
        ));
    }

    #[test]
    fn palette_hold_override_with_valid_id() {
        let mut project = {
            let mut p = project_with_playlist(1);
            let playlist = p.playlists.get_mut(&1).unwrap();
            playlist.palettes = vec![
                dmx_engine::proto::ColorPalette {
                    id: 30,
                    name: "Palette X".to_string(),
                    ..Default::default()
                },
                dmx_engine::proto::ColorPalette {
                    id: 40,
                    name: "Palette Y".to_string(),
                    ..Default::default()
                },
            ];
            p
        };

        let mut args = AutopilotArgs::default();
        args.palette_hold = Some(40);
        let mode = RenderModeArgs::Autopilot(args);

        assert_eq!(
            resolve_render_mode(&mode, &mut project),
            Ok(Mode::Autopilot(Autopilot { playlist_id: 1 }))
        );

        let playlist = project.playlists.get(&1).unwrap();
        assert!(matches!(
            playlist.palette_order,
            Some(PaletteOrder::PaletteHold(Hold { id: 40 }))
        ));
    }

    #[test]
    fn palette_hold_override_with_invalid_id() {
        let mut project = {
            let mut p = project_with_playlist(1);
            let playlist = p.playlists.get_mut(&1).unwrap();
            playlist.palettes = vec![dmx_engine::proto::ColorPalette {
                id: 30,
                name: "Palette X".to_string(),
                ..Default::default()
            }];
            p
        };

        let mut args = AutopilotArgs::default();
        args.palette_hold = Some(999);
        let mode = RenderModeArgs::Autopilot(args);

        let error = resolve_render_mode(&mode, &mut project).unwrap_err();
        assert!(error.contains("Palette 999 does not exist"), "{error}");
        assert!(error.contains("Palette X (30)"), "{error}");
    }

    #[test]
    fn palette_sequential_override() {
        let mut project = project_with_playlist(1);

        let mut args = AutopilotArgs::default();
        args.palette_sequential = true;
        let mode = RenderModeArgs::Autopilot(args);

        assert_eq!(
            resolve_render_mode(&mode, &mut project),
            Ok(Mode::Autopilot(Autopilot { playlist_id: 1 }))
        );

        let playlist = project.playlists.get(&1).unwrap();
        assert!(matches!(
            playlist.palette_order,
            Some(PaletteOrder::PaletteSequential(_))
        ));
    }

    #[test]
    fn palette_shuffle_override() {
        let mut project = project_with_playlist(1);

        let mut args = AutopilotArgs::default();
        args.palette_shuffle = true;
        let mode = RenderModeArgs::Autopilot(args);

        assert_eq!(
            resolve_render_mode(&mode, &mut project),
            Ok(Mode::Autopilot(Autopilot { playlist_id: 1 }))
        );

        let playlist = project.playlists.get(&1).unwrap();
        assert!(matches!(
            playlist.palette_order,
            Some(PaletteOrder::PaletteShuffle(_))
        ));
    }

    #[test]
    fn no_override_preserves_project_settings() {
        let mut project = {
            let mut p = project_with_playlist(1);
            let playlist = p.playlists.get_mut(&1).unwrap();
            playlist.pattern_order = Some(PatternOrder::PatternSequential(Sequential {}));
            playlist.palette_order = Some(PaletteOrder::PaletteShuffle(Shuffle {}));
            p
        };

        let original_pattern_order = project.playlists.get(&1).unwrap().pattern_order.clone();
        let original_palette_order = project.playlists.get(&1).unwrap().palette_order.clone();

        let args = AutopilotArgs::default();
        let mode = RenderModeArgs::Autopilot(args);

        resolve_render_mode(&mode, &mut project).unwrap();

        let playlist = project.playlists.get(&1).unwrap();
        assert_eq!(playlist.pattern_order, original_pattern_order);
        assert_eq!(playlist.palette_order, original_palette_order);
    }
}
