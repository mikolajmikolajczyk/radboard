use radicle::profile::Profile;
use radicle::storage::ReadStorage as _;

use crate::types::{IdentityInfo, RepoInfo};

#[tauri::command]
pub fn get_identity() -> Result<Option<IdentityInfo>, String> {
    match Profile::load() {
        Ok(profile) => {
            let alias = profile.config.alias().to_string();
            Ok(Some(IdentityInfo {
                did: profile.did().to_string(),
                alias: if alias.is_empty() { None } else { Some(alias) },
            }))
        }
        Err(radicle::profile::Error::NotFound(_)) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn list_repos() -> Result<Vec<RepoInfo>, String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let repos = profile.storage.repositories().map_err(|e| e.to_string())?;

    let mut result = Vec::with_capacity(repos.len());
    for info in repos {
        let project = match info.doc.project() {
            Ok(p) => p,
            Err(_) => continue,
        };
        result.push(RepoInfo {
            rid: info.rid.to_string(),
            name: project.name().to_owned(),
            description: project.description().to_owned(),
            default_branch: project.default_branch().to_string(),
            delegate_dids: info.doc.delegates()
                .iter()
                .map(|did| did.to_string())
                .collect(),
        });
    }
    Ok(result)
}

/// Ensure GSettings schemas are available before opening the GTK file picker.
/// GTK calls g_error() (abort) if schemas are missing — uncatchable from Rust/JS.
///
/// Strategy:
///   1. Check profile dirs (XDG_DATA_DIRS, ~/.nix-profile, /run/current-system/sw, …)
///      for gschemas.compiled or .gschema.xml files.
///   2. Also scan /nix/store for any package whose name contains "gsettings" or "glib-2"
///      — this catches the common NixOS case where the package is installed but its
///      store path never made it into XDG_DATA_DIRS.
///   3. If a compiled bundle is found anywhere, set GSETTINGS_SCHEMA_DIR and return Ok.
///   4. If only XML files are found, compile them with glib-compile-schemas and set
///      GSETTINGS_SCHEMA_DIR to the temp result.
#[tauri::command]
pub fn check_gsettings() -> Result<(), String> {
    let home = std::env::var("HOME").unwrap_or_default();

    // ── Build candidate list from well-known paths + XDG_DATA_DIRS ──────────
    let mut candidates: Vec<String> = vec![
        std::env::var("GSETTINGS_SCHEMA_DIR").unwrap_or_default(),
        "/usr/share/glib-2.0/schemas".to_string(),
        "/usr/local/share/glib-2.0/schemas".to_string(),
        "/run/current-system/sw/share/glib-2.0/schemas".to_string(),
        format!("{}/.nix-profile/share/glib-2.0/schemas", home),
    ];
    if let Ok(xdg) = std::env::var("XDG_DATA_DIRS") {
        for part in xdg.split(':').filter(|s| !s.is_empty()) {
            candidates.push(format!("{part}/glib-2.0/schemas"));
        }
    }

    // ── Also scan /nix/store for gsettings / glib-2 packages ────────────────
    // This is a flat listing (no recursive walk) so it's fast even on large stores.
    if let Ok(store_entries) = std::fs::read_dir("/nix/store") {
        for entry in store_entries.flatten() {
            let name = entry.file_name();
            let n = name.to_string_lossy();
            if n.contains("gsettings") || n.contains("glib-2") || n.contains("glib2") {
                candidates.push(
                    entry.path().join("share/glib-2.0/schemas").to_string_lossy().into_owned()
                );
            }
        }
    }

    candidates.dedup();

    // ── 1. Look for a pre-compiled bundle ───────────────────────────────────
    for dir in &candidates {
        if !dir.is_empty() && std::path::Path::new(dir).join("gschemas.compiled").exists() {
            unsafe { std::env::set_var("GSETTINGS_SCHEMA_DIR", dir); }
            return Ok(());
        }
    }

    // ── 2. Collect dirs that have XML files (for on-the-fly compilation) ────
    let xml_dirs: Vec<&str> = candidates.iter()
        .filter(|d| {
            if d.is_empty() { return false; }
            let p = std::path::Path::new(d.as_str());
            p.is_dir() && std::fs::read_dir(p).map(|mut e| {
                e.any(|en| en.map(|en|
                    en.path().extension().is_some_and(|x| x == "xml")
                ).unwrap_or(false))
            }).unwrap_or(false)
        })
        .map(|d| d.as_str())
        .collect();

    if xml_dirs.is_empty() {
        return Err(
            "GSettings schemas not found — the file picker will crash.\n\n\
             Searched XDG_DATA_DIRS, ~/.nix-profile, /run/current-system/sw, and \
             /nix/store (gsettings/glib-2 packages) — no .gschema.xml files found.\n\n\
             Set GSETTINGS_SCHEMA_DIR in your environment, or type the path manually \
             instead of using Browse.".to_string()
        );
    }

    // ── 3. Compile XML files into a temp dir ────────────────────────────────
    let temp_dir = std::env::temp_dir().join("radboard-gschemas");
    let _ = std::fs::remove_dir_all(&temp_dir);
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("mkdir temp: {e}"))?;

    for dir in &xml_dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let src = entry.path();
                if src.extension().is_some_and(|e| e == "xml") {
                    let _ = std::fs::copy(&src, temp_dir.join(entry.file_name()));
                }
            }
        }
    }

    let compile = std::process::Command::new("glib-compile-schemas")
        .arg(&temp_dir)
        .output()
        .map_err(|e| format!("glib-compile-schemas not found: {e}"))?;

    if !compile.status.success() {
        return Err(format!(
            "Schema compilation failed: {}",
            String::from_utf8_lossy(&compile.stderr)
        ));
    }

    unsafe { std::env::set_var("GSETTINGS_SCHEMA_DIR", &temp_dir); }
    Ok(())
}
