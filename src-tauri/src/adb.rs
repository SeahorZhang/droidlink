use serde::Serialize;
use std::process::Command;

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

#[derive(Serialize)]
pub struct DeviceInfo {
    pub battery: i32,
    pub storage: String,
    pub android_version: String,
    pub screen_size: String,
    pub ip_address: String,
    pub screen_on: bool,
    pub device_name: String,
    pub charging: bool,
    pub manufacturer: String,
    pub model: String,
    pub wifi_name: String,
    pub memory: String,
}

#[tauri::command]
pub async fn get_device_info(serial: String) -> Result<DeviceInfo, String> {
    let adb = get_adb_path();
    let run = |args: Vec<&str>| -> String {
        let mut full_args = vec!["-s", &serial];
        full_args.extend_from_slice(&args);
        Command::new(&adb)
            .args(&full_args)
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default()
    };

    // Battery
    let battery_out = run(vec!["shell", "dumpsys", "battery"]);
    let battery = battery_out.lines()
        .find(|l| l.trim().starts_with("level:"))
        .and_then(|l| l.split(':').nth(1))
        .and_then(|v| v.trim().parse::<i32>().ok())
        .unwrap_or(-1);

    let charging = battery_out.lines()
        .find(|l| l.trim().starts_with("status:"))
        .and_then(|l| l.split(':').nth(1))
        .map(|v| v.trim() == "2" || v.trim() == "5")
        .unwrap_or(false);

    // Storage
    let storage = run(vec!["shell", "df", "/data", "-h"]);
    let storage_str = storage.lines().nth(1)
        .and_then(|l| {
            let cols: Vec<&str> = l.split_whitespace().collect();
            if cols.len() >= 4 { Some(format!("{}/{}", cols[2], cols[1])) }
            else { None }
        })
        .unwrap_or_default();

    // Android version
    let android_version = run(vec!["shell", "getprop", "ro.build.version.release"])
        .trim().to_string();

    // Screen size
    let screen_size = run(vec!["shell", "wm", "size"])
        .lines()
        .find(|l| l.contains("Physical size"))
        .and_then(|l| l.split(':').nth(1))
        .map(|v| v.trim().to_string())
        .unwrap_or_default();

    // IP address
    let ip_address = run(vec!["shell", "ip", "addr", "show", "wlan0"])
        .lines()
        .find(|l| l.trim().starts_with("inet "))
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|l| l.split('/').next())
        .unwrap_or("")
        .to_string();

    // Screen on/off
    let screen_on = run(vec!["shell", "dumpsys", "power"])
        .lines()
        .any(|l| l.trim() == "mHoldingDisplaySuspendBlocker=true");

    // Device name
    let device_name = run(vec!["shell", "getprop", "ro.product.marketname"])
        .trim().to_string();
    let brand = run(vec!["shell", "getprop", "ro.product.brand"])
        .trim().to_string();
    let display_name = if device_name.is_empty() { brand } else { format!("{} {}", brand, device_name) };

    // Manufacturer
    let manufacturer = run(vec!["shell", "getprop", "ro.product.manufacturer"])
        .trim().to_string();

    // Model
    let model = run(vec!["shell", "getprop", "ro.product.model"])
        .trim().to_string();

    // Wi-Fi name (SSID)
    let wifi_name = run(vec!["shell", "cmd", "wifi", "list-networks"])
        .lines()
        .find(|l| l.contains("CURRENT"))
        .and_then(|l| l.split_whitespace().nth(1))
        .unwrap_or("")
        .to_string();

    // Memory usage
    let meminfo = run(vec!["shell", "cat", "/proc/meminfo"]);
    let mem_total = meminfo.lines()
        .find(|l| l.starts_with("MemTotal:"))
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);
    let mem_available = meminfo.lines()
        .find(|l| l.starts_with("MemAvailable:"))
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);
    let mem_used = if mem_total > mem_available { mem_total - mem_available } else { 0 };
    let memory = if mem_total > 0 {
        format!("{:.1}/{:.1}G", mem_used as f64 / 1048576.0, mem_total as f64 / 1048576.0)
    } else {
        String::new()
    };

    Ok(DeviceInfo {
        battery,
        storage: storage_str,
        android_version,
        screen_size,
        ip_address,
        screen_on,
        device_name: display_name,
        charging,
        manufacturer,
        model,
        wifi_name,
        memory,
    })
}
