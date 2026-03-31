use std::io::{Read as IoRead, Write as IoWrite};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use uuid::Uuid;
use tauri::Emitter as _;

pub struct PtySession {
    pub master: Box<dyn portable_pty::MasterPty + Send>,
    pub writer: Box<dyn IoWrite + Send>,
    pub child:  Box<dyn portable_pty::Child + Send + Sync>,
}

pub type PtyRegistry = Arc<Mutex<std::collections::HashMap<String, PtySession>>>;

#[tauri::command]
pub fn pty_spawn(
    cwd: String,
    cols: u16,
    rows: u16,
    app: tauri::AppHandle,
    registry: tauri::State<PtyRegistry>,
) -> Result<String, String> {
    let terminal_id = Uuid::new_v4().to_string();

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new_default_prog();
    cmd.cwd(&cwd);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    let tid = terminal_id.clone();
    let app_clone = app.clone();
    let registry_clone = Arc::clone(&*registry);
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => {
                    if let Some(mut session) = registry_clone.lock().unwrap().remove(&tid) {
                        let _ = session.child.kill();
                    }
                    let _ = app_clone.emit(
                        "pty_exit",
                        serde_json::json!({ "terminalId": tid }),
                    );
                    break;
                }
                Ok(n) => {
                    use base64::Engine as _;
                    let encoded = base64::engine::general_purpose::STANDARD.encode(&buf[..n]);
                    let _ = app_clone.emit(
                        "pty_data",
                        serde_json::json!({
                            "terminalId": tid,
                            "data": encoded,
                        }),
                    );
                }
            }
        }
    });

    registry.lock().unwrap().insert(terminal_id.clone(), PtySession {
        master: pair.master,
        writer,
        child,
    });

    Ok(terminal_id)
}

#[tauri::command]
pub fn pty_write(
    terminal_id: String,
    data: Vec<u8>,
    registry: tauri::State<PtyRegistry>,
) -> Result<(), String> {
    let mut map = registry.lock().unwrap();
    let session = map.get_mut(&terminal_id).ok_or("unknown terminal")?;
    session.writer.write_all(&data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(
    terminal_id: String,
    cols: u16,
    rows: u16,
    registry: tauri::State<PtyRegistry>,
) -> Result<(), String> {
    let map = registry.lock().unwrap();
    let session = map.get(&terminal_id).ok_or("unknown terminal")?;
    session.master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_kill(
    terminal_id: String,
    registry: tauri::State<PtyRegistry>,
) -> Result<(), String> {
    let mut map = registry.lock().unwrap();
    if let Some(mut session) = map.remove(&terminal_id) {
        let _ = session.child.kill();
    }
    Ok(())
}
