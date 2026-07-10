use serde::Serialize;
use std::process::Command;

fn get_adb_path() -> String {
    // Check bundled adb first, then system adb
    let bundled = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("resources/scrcpy/adb")))
        .filter(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string());

    bundled.unwrap_or_else(|| "adb".to_string())
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

    Ok(DeviceInfo {
        battery,
        storage: storage_str,
        android_version,
        screen_size,
        ip_address,
        screen_on,
        device_name: display_name,
        charging,
    })
}
