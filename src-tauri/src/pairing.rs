use mdns_sd::ServiceDaemon;
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::State;

#[derive(Serialize, Deserialize, Clone)]
pub struct PairingStatus {
    pub state: String,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct DiscoveredDevice {
    pub name: String,
    pub address: String,
}

pub struct PairingState {
    pub status: Arc<Mutex<PairingStatus>>,
    pub devices: Arc<Mutex<Vec<DiscoveredDevice>>>,
    pub password: Mutex<Option<String>>,
    cancel: Arc<AtomicBool>,
}

impl PairingState {
    pub fn new() -> Self {
        Self {
            status: Arc::new(Mutex::new(PairingStatus {
                state: "idle".to_string(),
                message: String::new(),
            })),
            devices: Arc::new(Mutex::new(Vec::new())),
            password: Mutex::new(None),
            cancel: Arc::new(AtomicBool::new(false)),
        }
    }
}

fn get_adb_path() -> String {
    let exe = std::env::current_exe().ok();
    if let Some(exe) = &exe {
        let dev_path = exe.parent().unwrap().join("resources/scrcpy/adb");
        if dev_path.exists() {
            return dev_path.to_string_lossy().to_string();
        }
        if let Some(contents) = exe.parent().and_then(|p| p.parent()) {
            let bundle_path = contents.join("Resources/resources/scrcpy/adb");
            if bundle_path.exists() {
                return bundle_path.to_string_lossy().to_string();
            }
        }
    }
    "adb".to_string()
}

#[tauri::command]
pub async fn start_discovery(state: State<'_, PairingState>) -> Result<bool, String> {
    state.cancel.store(false, Ordering::Relaxed);
    state.devices.lock().unwrap().clear();
    {
        let mut s = state.status.lock().unwrap();
        s.state = "waiting".to_string();
        s.message = "正在搜索设备...".to_string();
    }

    let status_clone = state.status.clone();
    let devices_clone = state.devices.clone();
    let cancel_clone = state.cancel.clone();
    std::thread::spawn(move || {
        run_discovery(status_clone, devices_clone, cancel_clone);
    });

    Ok(true)
}

#[tauri::command]
pub async fn start_pairing(
    password: String,
    state: State<'_, PairingState>,
) -> Result<bool, String> {
    // Store password and reset state
    {
        *state.password.lock().unwrap() = Some(password.clone());
        state.devices.lock().unwrap().clear();
        state.cancel.store(false, Ordering::Relaxed);
        let mut s = state.status.lock().unwrap();
        s.state = "waiting".to_string();
        s.message = "正在搜索设备...".to_string();
    }

    // Start mDNS discovery in a background thread
    let status_clone = state.status.clone();
    let devices_clone = state.devices.clone();
    let cancel_clone = state.cancel.clone();
    std::thread::spawn(move || {
        run_discovery(status_clone, devices_clone, cancel_clone);
    });

    Ok(true)
}

fn run_discovery(
    status: Arc<Mutex<PairingStatus>>,
    devices: Arc<Mutex<Vec<DiscoveredDevice>>>,
    cancel: Arc<AtomicBool>,
) {
    let mdns = match ServiceDaemon::new() {
        Ok(m) => m,
        Err(e) => {
            let mut s = status.lock().unwrap();
            s.state = "error".to_string();
            s.message = format!("mDNS 初始化失败: {}", e);
            return;
        }
    };

    let browser = match mdns.browse("_adb-tls-pairing._tcp.local.") {
        Ok(b) => b,
        Err(e) => {
            let mut s = status.lock().unwrap();
            s.state = "error".to_string();
            s.message = format!("mDNS 浏览失败: {}", e);
            return;
        }
    };

    let timeout = Duration::from_secs(120);
    loop {
        if cancel.load(Ordering::Relaxed) {
            return;
        }

        let event = match browser.recv_timeout(timeout) {
            Ok(e) => e,
            Err(_) => {
                let mut s = status.lock().unwrap();
                s.state = "error".to_string();
                s.message = "未发现设备，请确保手机已开启无线调试".to_string();
                return;
            }
        };

        if let mdns_sd::ServiceEvent::ServiceResolved(info) = event {
            let addresses = info.get_addresses();
            let ip = addresses
                .iter()
                .find(|a| a.is_ipv4())
                .or_else(|| addresses.iter().next())
                .map(|a| a.to_string());
            let port = info.get_port();

            let address = match ip {
                Some(ip) => format!("{}:{}", ip, port),
                None => format!("{}:{}", info.get_hostname(), port),
            };

            let device = DiscoveredDevice {
                name: info.get_fullname().to_string(),
                address,
            };

            // Deduplicate by address
            let mut devs = devices.lock().unwrap();
            if !devs.iter().any(|d| d.address == device.address) {
                devs.push(device);
            }
        }
    }
}

#[tauri::command]
pub async fn get_discovered_devices(
    state: State<'_, PairingState>,
) -> Result<Vec<DiscoveredDevice>, String> {
    Ok(state.devices.lock().unwrap().clone())
}

#[tauri::command]
pub async fn pair_device(
    address: String,
    state: State<'_, PairingState>,
) -> Result<bool, String> {
    // Stop mDNS discovery
    state.cancel.store(true, Ordering::Relaxed);

    let password = state
        .password
        .lock()
        .unwrap()
        .clone()
        .ok_or("未找到配对密码")?;

    // Update status
    {
        let mut s = state.status.lock().unwrap();
        s.state = "pairing".to_string();
        s.message = "正在配对...".to_string();
    }

    // Run adb pair with timeout
    let child = Command::new(get_adb_path())
        .args(["pair", &address, &password])
        .spawn()
        .map_err(|e| format!("配对失败: {}", e))?;

    let child = Arc::new(Mutex::new(Some(child)));
    let child_clone = child.clone();

    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let c = child_clone.lock().unwrap().take().unwrap();
        let _ = tx.send(c.wait_with_output());
    });

    let mut s = state.status.lock().unwrap();
    match rx.recv_timeout(Duration::from_secs(30)) {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            if output.status.success() {
                s.state = "success".to_string();
                s.message = "配对成功！".to_string();
            } else {
                let detail = if !stderr.is_empty() {
                    stderr.trim().to_string()
                } else {
                    stdout.trim().to_string()
                };
                s.state = "error".to_string();
                s.message = format!("配对失败: {}", detail);
            }
        }
        Ok(Err(e)) => {
            s.state = "error".to_string();
            s.message = format!("配对失败: {}", e);
        }
        Err(_) => {
            if let Some(mut c) = child.lock().unwrap().take() {
                let _ = c.kill();
            }
            s.state = "error".to_string();
            s.message = "配对超时，请重试".to_string();
        }
    }

    Ok(true)
}

#[tauri::command]
pub async fn pair_device_with_code(
    address: String,
    code: String,
    state: State<'_, PairingState>,
) -> Result<bool, String> {
    {
        let mut s = state.status.lock().unwrap();
        s.state = "pairing".to_string();
        s.message = "正在配对...".to_string();
    }

    let child = Command::new(get_adb_path())
        .args(["pair", &address, &code])
        .spawn()
        .map_err(|e| format!("配对失败: {}", e))?;

    let child = Arc::new(Mutex::new(Some(child)));
    let child_clone = child.clone();

    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let c = child_clone.lock().unwrap().take().unwrap();
        let _ = tx.send(c.wait_with_output());
    });

    let mut s = state.status.lock().unwrap();
    match rx.recv_timeout(Duration::from_secs(30)) {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            if output.status.success() {
                s.state = "success".to_string();
                s.message = "配对成功！".to_string();
            } else {
                let output = if !stderr.is_empty() {
                    stderr.trim().to_string()
                } else {
                    stdout.trim().to_string()
                };
                let lower = output.to_lowercase();
                if lower.contains("incorrect") || lower.contains("wrong") || lower.contains("invalid") {
                    s.state = "error".to_string();
                    s.message = "配对码错误，请重新输入".to_string();
                } else {
                    s.state = "error".to_string();
                    s.message = format!("配对失败: {}", output);
                }
            }
        }
        Ok(Err(e)) => {
            s.state = "error".to_string();
            s.message = format!("配对失败: {}", e);
        }
        Err(_) => {
            if let Some(mut c) = child.lock().unwrap().take() {
                let _ = c.kill();
            }
            s.state = "error".to_string();
            s.message = "配对超时，请重试".to_string();
        }
    }

    Ok(true)
}

#[tauri::command]
pub async fn restart_discovery(state: State<'_, PairingState>) -> Result<bool, String> {
    // Stop current discovery
    state.cancel.store(true, Ordering::Relaxed);

    let _password = state
        .password
        .lock()
        .unwrap()
        .clone()
        .ok_or("未找到配对密码")?;

    // Reset devices and status
    state.devices.lock().unwrap().clear();
    state.cancel.store(false, Ordering::Relaxed);
    {
        let mut s = state.status.lock().unwrap();
        s.state = "waiting".to_string();
        s.message = "正在搜索设备...".to_string();
    }

    // Start new discovery
    let status_clone = state.status.clone();
    let devices_clone = state.devices.clone();
    let cancel_clone = state.cancel.clone();
    std::thread::spawn(move || {
        run_discovery(status_clone, devices_clone, cancel_clone);
    });

    Ok(true)
}

#[tauri::command]
pub async fn cancel_pairing(state: State<'_, PairingState>) -> Result<bool, String> {
    state.cancel.store(true, Ordering::Relaxed);
    *state.password.lock().unwrap() = None;
    state.devices.lock().unwrap().clear();
    let mut s = state.status.lock().unwrap();
    s.state = "idle".to_string();
    s.message.clear();
    Ok(true)
}

#[tauri::command]
pub async fn get_pairing_status(
    state: State<'_, PairingState>,
) -> Result<PairingStatus, String> {
    Ok(state.status.lock().unwrap().clone())
}
