mod adb;
mod commands;
mod pairing;
mod scrcpy;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Create data directories
            let data_dir = app.path().app_data_dir().expect("failed to get app data dir");
            std::fs::create_dir_all(&data_dir).ok();
            std::fs::create_dir_all(data_dir.join("app-icons")).ok();

            // Initialize state
            app.manage(pairing::PairingState::new());
            app.manage(scrcpy::ScrcpyState::new());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::adb,
            commands::http_get,
            commands::read_file,
            commands::write_file,
            commands::get_data_dir,
            pairing::start_pairing,
            pairing::start_discovery,
            pairing::get_pairing_status,
            pairing::get_discovered_devices,
            pairing::pair_device,
            pairing::pair_device_with_code,
            pairing::restart_discovery,
            pairing::cancel_pairing,
            scrcpy::start_scrcpy,
            scrcpy::stop_scrcpy,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
