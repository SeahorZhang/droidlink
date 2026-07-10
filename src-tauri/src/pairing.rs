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

    // Start mDNS discovery in a background thread
    let state_clone = state.status.clone();
    let password_clone = password.clone();
    std::thread::spawn(move || {
        run_pairing(state_clone, &password_clone);
    });

    Ok(serde_json::json!({
        "success": true,
        "qrDataUrl": format!("data:image/svg+xml;base64,{}", base64::Engine::encode(&base64::engine::general_purpose::STANDARD, qr_svg.as_bytes())),
        "code": password,
    }))
}

fn run_pairing(status: std::sync::Arc<Mutex<PairingStatus>>, password: &str) {
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

    let password = password.to_string();

    // Use recv_timeout to avoid blocking forever if no device is found
    let timeout = std::time::Duration::from_secs(120);
    loop {
        let event = match browser.recv_timeout(timeout) {
            Ok(e) => e,
            Err(_) => {
                let mut s = status.lock().unwrap();
                s.state = "error".to_string();
                s.message = "未发现设备，请确保手机已开启无线调试并扫描了二维码".to_string();
                return;
            }
        };

        if let mdns_sd::ServiceEvent::ServiceResolved(info) = event {
            let mut s = status.lock().unwrap();
            s.state = "pairing".to_string();
            s.message = "正在配对...".to_string();
            drop(s);

            // Prefer IPv4 over IPv6 — adb pair may not handle IPv6 well
            let addresses = info.get_addresses();
            let ip = addresses
                .iter()
                .find(|a| a.is_ipv4())
                .or_else(|| addresses.iter().next())
                .map(|a| a.to_string());
            let port = info.get_port();

            let address = match ip {
                Some(ip) => format!("{}:{}", ip, port),
                None => {
                    // Fallback to hostname if no IP found
                    format!("{}:{}", info.get_hostname(), port)
                }
            };

            // Run adb pair
            let result = Command::new(get_adb_path())
                .args(["pair", &address, &password])
                .output();

            let mut s = status.lock().unwrap();
            match result {
                Ok(output) => {
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
                        s.message = format!("配对失败 [{}]: {}", address, detail);
                    }
                }
                Err(e) => {
                    s.state = "error".to_string();
                    s.message = format!("配对失败: {}", e);
                }
            }
            break;
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
