#[cfg(desktop)]
mod audio_detection;
mod beat;
#[cfg(desktop)]
mod midi;
mod output_loop;
mod project;
mod render;
mod sacn;
#[cfg(desktop)]
mod serial;
mod wled;

/// No-op stub for mobile — serial DMX hardware is not available on iOS/Android
#[cfg(mobile)]
mod serial {
    pub struct SerialState;

    impl SerialState {
        pub fn new() -> Self {
            SerialState
        }

        pub fn auto_bind_serial_outputs(&self) -> Result<(), String> {
            Ok(())
        }

        pub fn output_dmx_internal(&self, _output_id: &str, _data: &[u8]) -> Result<(), String> {
            Ok(())
        }
    }
}

use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use tauri::{Manager, RunEvent};
use tokio::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_keepawake::init());

    let app = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Register logging plugin first so all log::* calls are captured
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
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

            let shared_beat_sampler: beat::SharedBeatSampler =
                Arc::new(StdMutex::new(beat::TauriBeatSampler::new()));

            app.manage(shared_beat_sampler.clone());

            #[cfg(desktop)]
            {
                let midi_state =
                    midi::MidiState::new(app.handle().clone(), shared_beat_sampler.clone());
                let midi_state_arc = Arc::new(Mutex::new(midi_state));

                // Start the MIDI device watcher for auto-reconnect
                {
                    let state_clone = midi_state_arc.clone();
                    let midi = midi_state_arc.blocking_lock();
                    midi.start_device_watcher(state_clone);
                }

                app.manage(midi_state_arc);

                let beat_detection_state =
                    beat::BeatDetectionState::new(app.handle().clone(), shared_beat_sampler);
                let beat_detection_arc = Arc::new(Mutex::new(beat_detection_state));

                // Start the audio device watcher for auto-reconnect
                {
                    let state_clone = beat_detection_arc.clone();
                    beat_detection_arc
                        .blocking_lock()
                        .start_device_watcher(state_clone);
                }

                app.manage(beat_detection_arc);
            }

            let serial_state = serial::SerialState::new();
            let serial_state_arc = Arc::new(Mutex::new(serial_state));

            #[cfg(desktop)]
            {
                // Start the port watcher for auto-binding
                let state_clone = serial_state_arc.clone();
                let serial = serial_state_arc.blocking_lock();
                serial.start_port_watcher(state_clone);
            }

            app.manage(serial_state_arc);

            let sacn_state = sacn::SacnState::new()
                .map_err(|e| Box::new(std::io::Error::other(e)) as Box<dyn std::error::Error>)?;
            app.manage(Arc::new(Mutex::new(sacn_state)));

            let wled_state = wled::WledState::new()
                .map_err(|e| Box::new(std::io::Error::other(e)) as Box<dyn std::error::Error>)?;
            app.manage(Arc::new(Mutex::new(wled_state)));

            let output_loop_manager = output_loop::OutputLoopManager::new(app.handle().clone());
            let output_loop_manager_arc = Arc::new(Mutex::new(output_loop_manager));
            app.manage(output_loop_manager_arc.clone());

            // Start output loops for loaded project
            output_loop::OutputLoopManager::start_on_load(
                output_loop_manager_arc,
                app.state::<Arc<Mutex<serial::SerialState>>>()
                    .inner()
                    .clone(),
                app.state::<Arc<Mutex<sacn::SacnState>>>().inner().clone(),
                app.state::<Arc<Mutex<wled::WledState>>>().inner().clone(),
            );

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            #[cfg(desktop)]
            beat::connect_audio_input,
            #[cfg(desktop)]
            beat::disconnect_audio_input,
            #[cfg(desktop)]
            beat::list_audio_inputs,
            beat::add_beat_sample,
            beat::get_beat_t,
            #[cfg(desktop)]
            midi::connect_midi,
            #[cfg(desktop)]
            midi::disconnect_midi,
            #[cfg(desktop)]
            midi::list_midi_inputs,
            project::save_project,
            project::update_project,
            project::undo_project,
            project::redo_project,
            project::load_project,
            project::get_undo_state,
            project::request_update,
            project::save_assets,
            project::toggle_tile,
            project::export_project,
            project::import_project,
            render::render_dmx,
            render::set_render_mode,
            #[cfg(desktop)]
            serial::list_ports,
            project::frontend_ready_for_update,
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
