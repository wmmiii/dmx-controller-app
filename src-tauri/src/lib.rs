mod cas;
mod commands;
mod event_sink;
#[cfg(desktop)]
mod mcp;
mod project;
mod render;

use dmx_engine::beat::BeatSampler;
use dmx_runtime::beat::SharedBeatSampler;
use dmx_runtime::display_loop::DisplayLoopManager;
use dmx_runtime::events::EventSink;
use dmx_runtime::output_loop::OutputLoopManager;
use dmx_runtime::serial::SerialState;
use dmx_runtime::{ddp::DdpState, sacn::SacnState, shader::ShaderState, wled::WledState};
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use tauri::{Manager, RunEvent};
use tokio::sync::Mutex;

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

            // Get app data dir for persistence
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {e}"))
                .map_err(|e| Box::new(std::io::Error::other(e)) as Box<dyn std::error::Error>)?;

            // Load project from disk into engine
            project::load_from_disk(app.handle())
                .map_err(|e| Box::new(std::io::Error::other(e)) as Box<dyn std::error::Error>)?;

            // Create and manage PersistState for debounced writes
            let persist_state = project::PersistState::new(app_data_dir);
            app.manage(Arc::new(Mutex::new(persist_state)));

            let events: Arc<dyn EventSink> =
                Arc::new(event_sink::TauriEventSink::new(app.handle().clone()));

            let shared_beat_sampler: SharedBeatSampler =
                Arc::new(StdMutex::new(BeatSampler::default()));

            app.manage(shared_beat_sampler.clone());

            #[cfg(desktop)]
            {
                let midi_state = dmx_runtime::midi::MidiState::new(
                    Arc::clone(&events),
                    shared_beat_sampler.clone(),
                );
                let midi_state_arc = Arc::new(Mutex::new(midi_state));

                // Start the MIDI device watcher for auto-reconnect
                {
                    let state_clone = midi_state_arc.clone();
                    let midi = midi_state_arc.blocking_lock();
                    midi.start_device_watcher(state_clone);
                }

                app.manage(midi_state_arc);
            }

            #[cfg(desktop)]
            {
                let audio_input_state = dmx_runtime::audio_input::AudioInputState::new(
                    Arc::clone(&events),
                    shared_beat_sampler.clone(),
                );
                let audio_input_state_arc = Arc::new(Mutex::new(audio_input_state));
                {
                    let state_clone = audio_input_state_arc.clone();
                    let audio = audio_input_state_arc.blocking_lock();
                    audio.start_device_watcher(state_clone);
                }
                app.manage(audio_input_state_arc);
            }

            let serial_state = SerialState::default();
            let serial_state_arc = Arc::new(Mutex::new(serial_state));

            #[cfg(desktop)]
            {
                // Start the port watcher for auto-binding.
                let state_clone = serial_state_arc.clone();
                let serial = serial_state_arc.blocking_lock();
                serial.start_port_watcher(state_clone);
            }

            app.manage(serial_state_arc);

            let sacn_state = SacnState::new()
                .map_err(|e| Box::new(std::io::Error::other(e)) as Box<dyn std::error::Error>)?;
            app.manage(Arc::new(Mutex::new(sacn_state)));

            let wled_state = WledState::new()
                .map_err(|e| Box::new(std::io::Error::other(e)) as Box<dyn std::error::Error>)?;
            app.manage(Arc::new(Mutex::new(wled_state)));

            let ddp_state = DdpState::default();
            let ddp_state_arc = Arc::new(Mutex::new(ddp_state));
            app.manage(ddp_state_arc.clone());

            // Initialize the GPU shader state for visualizer rendering.
            let shader_state = match tauri::async_runtime::block_on(ShaderState::new()) {
                Ok(shader_state) => {
                    let shader_state_arc = Arc::new(StdMutex::new(shader_state));
                    app.manage(shader_state_arc.clone());

                    // Sync user visualizers from the loaded project so they're
                    // compiled before the display loop starts rendering.
                    dmx_runtime::shader::sync_visualizer_shaders(&shader_state_arc);
                    Some(shader_state_arc)
                }
                Err(e) => {
                    log::error!("Failed to initialize GPU shader state: {e}");
                    None
                }
            };

            let display_loop_manager = DisplayLoopManager::new(Arc::clone(&events), shader_state);
            let display_loop_manager_arc = Arc::new(Mutex::new(display_loop_manager));
            app.manage(display_loop_manager_arc.clone());

            // Start display loop for loaded project (handles all displays and DDP outputs)
            DisplayLoopManager::start_on_load(display_loop_manager_arc, ddp_state_arc);

            let output_loop_manager = OutputLoopManager::new(events);
            let output_loop_manager_arc = Arc::new(Mutex::new(output_loop_manager));
            app.manage(output_loop_manager_arc.clone());

            // Start output loops for loaded project (Serial, sACN, WLED - DDP is handled by display loop)
            OutputLoopManager::start_on_load(
                output_loop_manager_arc,
                app.state::<Arc<Mutex<SerialState>>>().inner().clone(),
                app.state::<Arc<Mutex<SacnState>>>().inner().clone(),
                app.state::<Arc<Mutex<WledState>>>().inner().clone(),
            );

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
        if let RunEvent::Exit = event {
            // Flush any pending writes before exit
            if let Some(persist_state) = app_handle.try_state::<Arc<Mutex<project::PersistState>>>()
            {
                let mut state = persist_state.blocking_lock();
                state.flush_sync();
            }
        }
    });
}
