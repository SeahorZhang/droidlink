use std::process::Command;
use std::sync::Mutex;
use tauri::{State, AppHandle, Emitter};

pub struct ScrcpyState {
    /// PID of the running scrcpy process, if any.
    pid: Mutex<Option<u32>>,
}

impl ScrcpyState {
    pub fn new() -> Self {
        Self {
            pid: Mutex::new(None),
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

fn kill_scrcpy_clean(pid: Option<u32>) {
    // Kill by PID
    if let Some(pid) = pid {
        #[cfg(unix)]
        unsafe { libc::kill(pid as i32, libc::SIGKILL); }
        #[cfg(windows)]
        let _ = Command::new("taskkill").args(["/PID", &pid.to_string(), "/F"]).output();
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
    pub args: Vec<String>,
}

#[tauri::command]
pub async fn start_scrcpy(
    options: ScrcpyOptions,
    state: State<'_, ScrcpyState>,
    app: AppHandle,
) -> Result<bool, String> {
    // Kill existing scrcpy first
    let old_pid = state.pid.lock().unwrap().take();
    kill_scrcpy_clean(old_pid);

    let args_str: Vec<&str> = options.args.iter().map(|s| s.as_str()).collect();
    let mut child = Command::new(get_scrcpy_path())
        .args(&args_str)
        .spawn()
        .map_err(|e| e.to_string())?;

    let pid = child.id();
    *state.pid.lock().unwrap() = Some(pid);

    // Spawn a thread that waits for the child to exit, then emits the event
    std::thread::spawn(move || {
        let _ = child.wait();
        let _ = app.emit("scrcpy-stopped", false);
    });

    Ok(true)
}

#[tauri::command]
pub async fn stop_scrcpy(
    state: State<'_, ScrcpyState>,
    app: AppHandle,
) -> Result<bool, String> {
    let pid = state.pid.lock().unwrap().take();
    kill_scrcpy_clean(pid);
    let _ = app.emit("scrcpy-stopped", false);
    Ok(true)
}
