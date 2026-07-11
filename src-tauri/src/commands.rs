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

/// 获取 companion-app.apk 的路径
/// dev 模式下从项目 resources 目录读取，build 模式下从打包资源读取
fn find_companion_apk(app: &tauri::AppHandle) -> Result<String, String> {
    // 1. 尝试从打包的资源目录获取（build 模式）
    if let Ok(resource_dir) = app.path().resource_dir() {
        let apk = resource_dir.join("companion-app.apk");
        if apk.exists() {
            return Ok(apk.to_string_lossy().to_string());
        }
    }

    // 2. dev 模式：从项目根目录的 resources 获取
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_default();

    // 向上查找项目根目录（包含 src-tauri 的目录）
    let mut search_dir = exe_dir.clone();
    for _ in 0..5 {
        if search_dir.join("src-tauri").exists() || search_dir.join("resources").exists() {
            let apk = search_dir.join("resources/companion-app.apk");
            if apk.exists() {
                return Ok(apk.to_string_lossy().to_string());
            }
        }
        if !search_dir.pop() {
            break;
        }
    }

    Err("companion-app.apk not found".to_string())
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

#[tauri::command]
pub async fn get_resource_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(app.path().resource_dir().map_err(|e| e.to_string())?.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_companion_apk_path(app: tauri::AppHandle) -> Result<String, String> {
    let path = find_companion_apk(&app)?;
    eprintln!("[DroidLink] APK path: {}", path);
    Ok(path)
}
