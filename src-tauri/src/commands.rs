use std::process::Command;
use tauri::Manager;

fn get_adb_path() -> String {
    let bundled = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("resources/scrcpy/adb")))
        .filter(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string());
    bundled.unwrap_or_else(|| "adb".to_string())
}

#[tauri::command]
pub async fn adb(args: Vec<String>) -> Result<String, String> {
    let adb_path = get_adb_path();
    let args_str: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = Command::new(&adb_path)
        .args(&args_str)
        .output()
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub async fn http_get(url: String) -> Result<String, String> {
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    resp.text().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    let dir = std::path::Path::new(&path).parent().unwrap();
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    std::fs::write(&path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.to_string_lossy().to_string())
}
