use std::fs;

use tauri::Manager as _;

use crate::types::LocalConfig;

fn config_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

#[tauri::command]
pub fn load_config(app: tauri::AppHandle) -> Result<Option<LocalConfig>, String> {
    let path = config_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let config: LocalConfig = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    Ok(Some(config))
}

#[tauri::command]
pub fn save_config(app: tauri::AppHandle, config: LocalConfig) -> Result<(), String> {
    let path = config_path(&app)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_rad_home() -> String {
    std::env::var("RAD_HOME").unwrap_or_else(|_| {
        std::env::var("HOME")
            .map(|h| format!("{}/.radicle", h))
            .unwrap_or_else(|_| "~/.radicle".to_owned())
    })
}
