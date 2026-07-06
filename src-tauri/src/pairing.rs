use mdns_sd::ServiceDaemon;
use qrcode::QrCode;
use qrcode::render::svg;
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::{Arc, Mutex};
use tauri::State;

#[derive(Serialize, Deserialize, Clone)]
pub struct PairingStatus {
    pub state: String,
    pub message: String,
}

pub struct PairingState {
    pub status: Arc<Mutex<PairingStatus>>,
}

impl PairingState {
    pub fn new() -> Self {
        Self {
            status: Arc::new(Mutex::new(PairingStatus {
                state: "idle".to_string(),
                message: String::new(),
            })),
        }
    }
}

fn get_adb_path() -> String {
    let bundled = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("resources/scrcpy/adb")))
        .filter(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string());
    bundled.unwrap_or_else(|| "adb".to_string())
}

#[tauri::command]
pub async fn generate_pairing_qr(
    state: State<'_, PairingState>,
) -> Result<serde_json::Value, String> {
    // Reset state
    {
        let mut s = state.status.lock().unwrap();
        s.state = "waiting".to_string();
        s.message = "等待手机扫码...".to_string();
    }

    let password = rand_password();
    let ssid = format!("d{}", rand_password());

    // Generate QR content (Wi-Fi format)
    let qr_content = format!("WIFI:T:ADB;S:{};P:{};;", ssid, password);

    // Render QR as SVG
    let code = QrCode::new(qr_content.as_bytes()).map_err(|e| e.to_string())?;
    let qr_svg = code.render::<svg::Color>().module_dimensions(8, 8).build();

    // Kill old adb server
    let _ = Command::new(get_adb_path())
        .args(["kill-server"])
        .output();

    // Wait for port to be released
    std::thread::sleep(std::time::Duration::from_millis(500));

    // Start Bonjour discovery in a background thread
    let state_clone = state.status.clone();
    let password_clone = password.clone();
    let qr_clone = qr_content.clone();
    std::thread::spawn(move || {
        run_pairing(state_clone, &password_clone, &qr_clone);
    });

    Ok(serde_json::json!({
        "success": true,
        "qrDataUrl": format!("data:image/svg+xml;base64,{}", base64::Engine::encode(&base64::engine::general_purpose::STANDARD, qr_svg.as_bytes())),
        "code": password,
    }))
}

fn run_pairing(status: std::sync::Arc<Mutex<PairingStatus>>, password: &str, _qr_content: &str) {
    let mdns = match ServiceDaemon::new() {
        Ok(m) => m,
        Err(_) => return,
    };

    let browser = match mdns.browse("_adb-tls-pairing._tcp.local.") {
        Ok(b) => b,
        Err(_) => return,
    };

    let password = password.to_string();

    // Listen for service discoveries
    while let Ok(event) = browser.recv() {
        match event {
            mdns_sd::ServiceEvent::ServiceResolved(info) => {
                let mut s = status.lock().unwrap();
                s.state = "pairing".to_string();
                s.message = "正在配对...".to_string();
                drop(s);

                // Get host and port
                let host = info.get_hostname().to_string();
                let port = info.get_port();

                // Run adb pair
                let result = Command::new(get_adb_path())
                    .args(["pair", &format!("{}:{}", host, port), &password])
                    .output();

                let mut s = status.lock().unwrap();
                match result {
                    Ok(output) => {
                        if output.status.success() {
                            s.state = "success".to_string();
                            s.message = "配对成功！".to_string();
                        } else {
                            s.state = "error".to_string();
                            s.message = "配对失败".to_string();
                        }
                    }
                    Err(_) => {
                        s.state = "error".to_string();
                        s.message = "配对失败".to_string();
                    }
                }
                break;
            }
            _ => {}
        }
    }
}

#[tauri::command]
pub async fn get_pairing_status(
    state: State<'_, PairingState>,
) -> Result<PairingStatus, String> {
    Ok(state.status.lock().unwrap().clone())
}

fn rand_password() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .subsec_nanos();
    format!("{:06}", nanos % 1000000)
}
