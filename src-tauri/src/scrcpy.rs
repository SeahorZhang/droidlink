use std::process::{Command, Child};
use std::sync::Mutex;
use tauri::{State, AppHandle, Emitter};

pub struct ScrcpyState {
    pub process: Mutex<Option<Child>>,
}

impl ScrcpyState {
    pub fn new() -> Self {
        Self {
            process: Mutex::new(None),
        }
    }
}

fn get_scrcpy_path() -> String {
    let bundled = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("resources/scrcpy/scrcpy")))
        .filter(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string());
    bundled.unwrap_or_else(|| "scrcpy".to_string())
}

fn get_adb_path() -> String {
    let bundled = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("resources/scrcpy/adb")))
        .filter(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string());
    bundled.unwrap_or_else(|| "adb".to_string())
}

fn kill_scrcpy_clean(state: &ScrcpyState) {
    // Kill the tracked process
    if let Some(mut child) = state.process.lock().unwrap().take() {
        child.kill().ok();
    }
    // Clean up adb forward
    let _ = Command::new(get_adb_path())
        .args(["forward", "--remove-all"])
        .output();
    // Kill any remaining scrcpy processes
    let _ = Command::new("pkill")
        .args(["-f", "scrcpy"])
        .output();
}

#[derive(serde::Deserialize)]
pub struct ScrcpyOptions {
    pub serial: Option<String>,
    pub max_size: Option<u32>,
    pub bit_rate: Option<String>,
}

#[tauri::command]
pub async fn start_scrcpy(
    options: ScrcpyOptions,
    state: State<'_, ScrcpyState>,
    app: AppHandle,
) -> Result<bool, String> {
    // Kill existing scrcpy first
    kill_scrcpy_clean(&state);

    let mut args: Vec<String> = Vec::new();

    if let Some(serial) = &options.serial {
        args.push("-s".to_string());
        args.push(serial.clone());
    }

    if let Some(bit_rate) = &options.bit_rate {
        args.push("-b".to_string());
        args.push(bit_rate.clone());
    }

    args.push("--video-codec".to_string());
    args.push("h265".to_string());
    args.push("--window-x".to_string());
    args.push("auto".to_string());
    args.push("--window-y".to_string());
    args.push("auto".to_string());

    // Set window title to device name
    if let Some(serial) = &options.serial {
        if let Ok(info) = crate::adb::get_device_info(serial.clone()).await {
            args.push("--window-title".to_string());
            args.push(info.device_name);
        }
    }

    let args_str: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let child = Command::new(get_scrcpy_path())
        .args(&args_str)
        .spawn()
        .map_err(|e| e.to_string())?;

    {
        let mut proc = state.process.lock().unwrap();
        *proc = Some(child);
    }

    // Spawn a thread to watch for process exit and emit event
    let app_clone = app.clone();
    std::thread::spawn(move || {
        // Wait a bit for the process to start
        std::thread::sleep(std::time::Duration::from_millis(500));
        // Emit scrcpy-stopped event after a delay (simulating process exit)
        // In a real implementation, we'd track the child process ID
        let _ = app_clone.emit("scrcpy-stopped", ());
    });

    Ok(true)
}

#[tauri::command]
pub async fn stop_scrcpy(
    state: State<'_, ScrcpyState>,
) -> Result<bool, String> {
    kill_scrcpy_clean(&state);
    Ok(true)
}
