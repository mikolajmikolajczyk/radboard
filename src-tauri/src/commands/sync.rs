/// Fetch the latest state of a repo from its seeds.
///
/// Best-effort: shells out to `rad sync --fetch -r <rid> -t 10s` and discards
/// stderr. Used to drive inbound discovery — outbound is handled per-write by
/// `announce_refs` in helpers.rs.
#[tauri::command]
pub async fn sync_repo_fetch(rid: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _ = std::process::Command::new("rad")
            .args(["sync", "--fetch", "-r", &rid, "-t", "10s"])
            .output();
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
