mod midi;
mod output_loop;
mod project;
mod render;
mod sacn;
mod serial;
mod wled;

use std::sync::Arc;
use tauri::{Manager, RunEvent};
use tokio::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_keepawake::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Get app data dir for persistence
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))
                .map_err(|e| {
                    Box::new(std::io::Error::new(std::io::ErrorKind::Other, e))
                        as Box<dyn std::error::Error>
                })?;

            // Load project from disk into engine
            project::load_from_disk(app.handle()).map_err(|e| {
                Box::new(std::io::Error::new(std::io::ErrorKind::Other, e))
                    as Box<dyn std::error::Error>
            })?;

            // Create and manage PersistState for debounced writes
            let persist_state = project::PersistState::new(app_data_dir);
            app.manage(Arc::new(Mutex::new(persist_state)));

            let midi_state = midi::MidiState::new(app.handle().clone());
            let midi_state_arc = Arc::new(Mutex::new(midi_state));

            // Start the MIDI device watcher for auto-reconnect
            {
                let state_clone = midi_state_arc.clone();
                let midi = midi_state_arc.blocking_lock();
                midi.start_device_watcher(state_clone);
            }

            app.manage(midi_state_arc);

            let sacn_state = sacn::SacnState::new().map_err(|e| {
                Box::new(std::io::Error::new(std::io::ErrorKind::Other, e))
                    as Box<dyn std::error::Error>
            })?;
            app.manage(Arc::new(Mutex::new(sacn_state)));

            let serial_state = serial::SerialState::new();
            let serial_state_arc = Arc::new(Mutex::new(serial_state));

            // Start the port watcher for auto-binding
            {
                let state_clone = serial_state_arc.clone();
                let serial = serial_state_arc.blocking_lock();
                serial.start_port_watcher(state_clone);
            }

            app.manage(serial_state_arc);

            let wled_state = wled::WledState::new().map_err(|e| {
                Box::new(std::io::Error::new(std::io::ErrorKind::Other, e))
                    as Box<dyn std::error::Error>
            })?;
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

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            midi::add_beat_sample,
            midi::connect_midi,
            midi::disconnect_midi,
            midi::list_midi_inputs,
            midi::set_first_beat,
            output_loop::rebuild_output_loops,
            output_loop::start_output_loop,
            output_loop::stop_output_loop,
            project::save_project,
            project::update_project,
            project::undo_project,
            project::redo_project,
            project::load_project,
            project::get_undo_state,
            project::request_update,
            project::save_assets,
            project::toggle_tile,
            render::render_dmx,
            render::render_wled,
            render::set_render_mode,
            sacn::output_sacn_dmx,
            serial::close_port,
            serial::list_ports,
            serial::open_port,
            serial::output_serial_dmx,
            project::frontend_ready_for_update,
            wled::output_wled,
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
