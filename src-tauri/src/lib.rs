mod midi;
mod sacn;
mod serial;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let midi_state = midi::MidiState::new(app.handle().clone());
            app.manage(midi_state);

            let sacn_state = sacn::SacnState::new().map_err(|e| {
                Box::new(std::io::Error::new(std::io::ErrorKind::Other, e))
                    as Box<dyn std::error::Error>
            })?;
            app.manage(sacn_state);

            let serial_state = serial::SerialState::new();
            app.manage(serial_state);

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
            midi::list_midi_inputs,
            midi::connect_midi,
            midi::send_midi_command,
            serial::list_ports,
            serial::open_port,
            serial::close_port,
            serial::output_serial_dmx,
            sacn::output_sacn_dmx
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
