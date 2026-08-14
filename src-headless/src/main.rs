mod events;

use clap::{Parser, ValueEnum};
use dmx_engine::project;
use dmx_engine::proto::render_mode::{Autopilot, Blackout, Mode};
use dmx_engine::proto::{FatProject, RenderMode};
use dmx_engine::render::render::RENDER_MODE_REF;
use dmx_runtime::runtime::{Runtime, RuntimeConfig};
use log::LevelFilter;
use prost::Message;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

use crate::events::LogEventSink;

/// Long enough for every output loop to push at least one blacked-out frame at
/// the default rates before the loops are torn down.
const BLACKOUT_DRAIN: Duration = Duration::from_millis(250);

/// Runs a DMX show without a display, for unattended installs.
#[derive(Parser)]
#[command(name = "dmx-controller-headless", version)]
struct Args {
    /// Path to a .dmxapp project exported from the desktop app.
    #[arg(long, value_name = "PATH")]
    project: PathBuf,

    /// How the show is driven. The playlist comes from the project itself.
    #[arg(long, value_enum)]
    mode: ShowMode,

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

#[derive(Clone, ValueEnum)]
enum ShowMode {
    Autopilot,
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
    let playlist_id = load_project(&args.project)?;

    set_render_mode(match args.mode {
        ShowMode::Autopilot => Mode::Autopilot(Autopilot { playlist_id }),
    })?;

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

/// Loads the project into the engine and returns the playlist to run.
fn load_project(path: &Path) -> Result<u64, String> {
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

    let playlist_id = project.active_playlist;
    if playlist_id == 0 {
        return Err(format!(
            "{} has no active playlist. Open it in the desktop app, select a playlist, and export again.",
            path.display()
        ));
    }

    let playlist = project.playlists.get(&playlist_id).ok_or_else(|| {
        format!(
            "Active playlist {playlist_id} is not present in {}",
            path.display()
        )
    })?;

    log::info!(
        "Loaded project \"{}\", playlist \"{}\"",
        project.name,
        playlist.name
    );

    project::load(project)?;

    Ok(playlist_id)
}

fn set_render_mode(mode: Mode) -> Result<(), String> {
    let mut render_mode = RENDER_MODE_REF
        .lock()
        .map_err(|e| format!("Failed to lock render mode: {e}"))?;
    *render_mode = RenderMode { mode: Some(mode) };

    Ok(())
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
    use dmx_engine::proto::{Playlist, Project};
    use std::collections::HashMap;

    struct Fixture(PathBuf);

    impl Fixture {
        fn new(name: &str, bytes: &[u8]) -> Self {
            let path = std::env::temp_dir().join(format!("dmx-headless-{name}.dmxapp"));
            std::fs::write(&path, bytes).unwrap();
            Self(path)
        }

        fn of(project: Project, name: &str) -> Self {
            Self::new(
                name,
                &FatProject {
                    project: Some(project),
                    cas: HashMap::new(),
                }
                .encode_to_vec(),
            )
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
    fn reports_a_missing_file() {
        let error = load_project(Path::new("/nonexistent/show.dmxapp")).unwrap_err();
        assert!(error.contains("Failed to read"), "{error}");
    }

    #[test]
    fn reports_an_absent_project() {
        let fixture = Fixture::new("absent-project", &FatProject::default().encode_to_vec());

        let error = load_project(&fixture.0).unwrap_err();
        assert!(error.contains("contains no project"), "{error}");
    }

    #[test]
    fn reports_an_unset_active_playlist() {
        let fixture = Fixture::of(
            Project {
                active_playlist: 0,
                ..project_with_playlist(7)
            },
            "unset-playlist",
        );

        let error = load_project(&fixture.0).unwrap_err();
        assert!(error.contains("no active playlist"), "{error}");
    }

    #[test]
    fn reports_an_active_playlist_that_was_deleted() {
        let fixture = Fixture::of(
            Project {
                playlists: HashMap::new(),
                ..project_with_playlist(7)
            },
            "deleted-playlist",
        );

        let error = load_project(&fixture.0).unwrap_err();
        assert!(error.contains("Active playlist 7 is not present"), "{error}");
    }

    #[test]
    fn loads_a_project_with_an_active_playlist() {
        let fixture = Fixture::of(project_with_playlist(7), "valid");

        assert_eq!(load_project(&fixture.0), Ok(7));
        assert_eq!(
            project::with_project(|project| Ok(project.name.clone())),
            Ok("Test Show".to_string())
        );
    }
}
