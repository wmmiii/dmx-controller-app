mod midi;
mod output_loop;
mod project;
mod render;
mod sacn;
mod serial;
mod wled;

use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex as TokioMutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let midi_state = midi::MidiState::new(app.handle().clone());
            app.manage(midi_state);

            let sacn_state = sacn::SacnState::new().map_err(|e| {
                Box::new(std::io::Error::new(std::io::ErrorKind::Other, e))
                    as Box<dyn std::error::Error>
            })?;
            let sacn_state_arc = Arc::new(TokioMutex::new(sacn_state));
            app.manage(sacn_state_arc.clone());

            let serial_state = serial::SerialState::new();
            let serial_state_arc = Arc::new(TokioMutex::new(serial_state));
            app.manage(serial_state_arc.clone());

            let wled_state = wled::WledState::new().map_err(|e| {
                Box::new(std::io::Error::new(std::io::ErrorKind::Other, e))
                    as Box<dyn std::error::Error>
            })?;
            let wled_state_arc = Arc::new(TokioMutex::new(wled_state));
            app.manage(wled_state_arc.clone());

            let output_loop_manager = output_loop::OutputLoopManager::new();
            let output_loop_manager_arc = Arc::new(TokioMutex::new(output_loop_manager));
            app.manage(output_loop_manager_arc);

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
            midi::connect_midi,
            midi::list_midi_inputs,
            output_loop::rebuild_output_loops,
            output_loop::start_output_loop,
            output_loop::stop_output_loop,
            project::update_project,
            render::render_scene_dmx,
            render::render_scene_wled,
            sacn::output_sacn_dmx,
            serial::close_port,
            serial::list_ports,
            serial::open_port,
            serial::output_serial_dmx,
            wled::output_wled,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
