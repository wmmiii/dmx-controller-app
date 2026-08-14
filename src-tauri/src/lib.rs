mod cas;
mod commands;
mod event_sink;
#[cfg(desktop)]
mod mcp;
mod project;
mod render;

use dmx_runtime::events::EventSink;
use dmx_runtime::project_store::{DiskProjectStore, ProjectStore};
use dmx_runtime::runtime::{Runtime, RuntimeConfig};
use std::sync::Arc;
use tauri::{Manager, RunEvent};

#[cfg(desktop)]
use tauri_plugin_keepawake::TauriPluginKeepawakeExt;

// Request 1ms Windows timer resolution for the lifetime of the process.
// Without this, tokio::time::sleep has ~15ms granularity on Windows,
// causing DMX frame intervals to spike (observed: 112ms at 30 FPS).
#[cfg(windows)]
#[link(name = "winmm")]
unsafe extern "system" {
    fn timeBeginPeriod(uPeriod: u32) -> u32;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(windows)]
    // SAFETY: timeBeginPeriod is always safe to call; 1 is the minimum valid period.
    unsafe {
        timeBeginPeriod(1);
    }

    // Suppress ALSA/JACK error messages on Linux before audio device enumeration.
    #[cfg(desktop)]
    dmx_runtime::audio_input::suppress_audio_lib_errors();

    let builder = tauri::Builder::default();

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_keepawake::init());

    let app = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // `setup` runs outside any Tokio context, but the device watchers
            // and render loops started below spawn onto whichever runtime is
            // current. Enter Tauri's for the rest of this closure.
            let _runtime = tauri::async_runtime::handle().inner().enter();

            // Register logging plugin first so all log::* calls are captured
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        // wgpu/naga log adapter and instance details at Info on
                        // every device init, which floods the log. Only surface
                        // their warnings and errors.
                        .level_for("wgpu", log::LevelFilter::Warn)
                        .level_for("wgpu_core", log::LevelFilter::Warn)
                        .level_for("wgpu_hal", log::LevelFilter::Warn)
                        .level_for("naga", log::LevelFilter::Warn)
                        .build(),
                )?;
            }

            let to_setup_error =
                |e: String| Box::new(std::io::Error::other(e)) as Box<dyn std::error::Error>;

            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {e}"))
                .map_err(to_setup_error)?;

            let store = Arc::new(DiskProjectStore::new(&app_data_dir));
            store.load().map_err(to_setup_error)?;

            let events: Arc<dyn EventSink> =
                Arc::new(event_sink::TauriEventSink::new(app.handle().clone()));

            let runtime = tauri::async_runtime::block_on(Runtime::start(RuntimeConfig {
                events,
                persist: Some(store),
                enable_visualizer: true,
                enable_audio: true,
                enable_midi: true,
            }))
            .map_err(to_setup_error)?;

            app.manage(runtime);

            // Prevent the system from sleeping while the app is running so that
            // output is never interrupted by idle sleep.
            #[cfg(desktop)]
            {
                use tauri_plugin_keepawake::KeepAwakeConfig;
                if let Err(e) = app.tauri_plugin_keepawake().start(
                    app.handle(),
                    Some(KeepAwakeConfig {
                        display: true,
                        idle: true,
                        sleep: true,
                    }),
                ) {
                    log::warn!("Failed to activate keep-awake: {e}");
                }
            }

            #[cfg(desktop)]
            mcp::spawn(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::add_beat_sample,
            commands::set_first_beat,
            commands::set_bpm,
            #[cfg(desktop)]
            commands::list_audio_inputs,
            #[cfg(desktop)]
            commands::connect_midi,
            #[cfg(desktop)]
            commands::disconnect_midi,
            #[cfg(desktop)]
            commands::list_midi_inputs,
            project::save_project,
            project::update_project,
            project::undo_project,
            project::redo_project,
            project::get_undo_state,
            project::request_update,
            project::toggle_tile,
            project::delete_visualizer,
            project::export_project,
            project::import_project,
            project::new_project,
            cas::import_audio_file,
            cas::read_cas_blob,
            render::render_dmx,
            render::set_render_mode,
            commands::compile_visualizer,
            commands::get_builtin_visualizers,
            #[cfg(desktop)]
            commands::list_ports,
            #[cfg(desktop)]
            mcp::bridge::mcp_frontend_response,
            commands::frontend_ready_for_update,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Run app with exit handler to flush pending writes
    app.run(|app_handle, event| {
        if let RunEvent::Exit = event
            && let Some(runtime) = app_handle.try_state::<Arc<Runtime>>()
        {
            runtime.flush_persist();
        }
    });
}
