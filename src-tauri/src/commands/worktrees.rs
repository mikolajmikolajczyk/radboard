use crate::types::{FileStatus, WorktreeInfo};

#[tauri::command]
pub fn find_local_repo(rid: String) -> Result<Option<String>, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let home_path = std::path::Path::new(&home);

    fn check_dir(path: &std::path::Path, rid: &str) -> bool {
        let cfg = path.join(".git").join("config");
        std::fs::read_to_string(cfg).map(|s| s.contains(rid)).unwrap_or(false)
    }

    let level1 = std::fs::read_dir(home_path).map_err(|e| e.to_string())?;
    for e1 in level1.flatten() {
        let p1 = e1.path();
        if !p1.is_dir() { continue; }
        if check_dir(&p1, &rid) { return Ok(Some(p1.to_string_lossy().into_owned())); }
        if p1.join(".git").exists() { continue; }
        if let Ok(level2) = std::fs::read_dir(&p1) {
            for e2 in level2.flatten() {
                let p2 = e2.path();
                if p2.is_dir() && check_dir(&p2, &rid) {
                    return Ok(Some(p2.to_string_lossy().into_owned()));
                }
            }
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn create_patch_worktree(
    local_path: String,
    branch_name: String,
) -> Result<String, String> {
    let repo_path = std::path::Path::new(&local_path);
    let branch = branch_name;

    let parent = repo_path.parent().ok_or("local_path has no parent")?;
    let worktree_path = parent.join(&branch);
    if worktree_path.exists() {
        return Err(format!("directory already exists: {}", worktree_path.display()));
    }

    let output = std::process::Command::new("git")
        .args(["worktree", "add"])
        .arg(&worktree_path)
        .args(["-b", &branch])
        .current_dir(repo_path)
        .output()
        .map_err(|e| format!("failed to run git: {}", e))?;

    if output.status.success() {
        Ok(worktree_path.to_string_lossy().into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

#[tauri::command]
pub fn list_worktrees(local_path: String) -> Result<Vec<WorktreeInfo>, String> {
    let output = std::process::Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(&local_path)
        .output()
        .map_err(|e| format!("git error: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let mut result = Vec::new();
    let mut current_path = String::new();
    let mut current_head = String::new();
    let mut current_branch = String::new();
    let mut is_bare = false;

    for line in text.lines() {
        if line.starts_with("worktree ") {
            if !current_path.is_empty() && !is_bare && current_path != local_path {
                result.push(WorktreeInfo {
                    path: current_path.clone(),
                    branch: current_branch.clone(),
                    head: current_head.clone(),
                });
            }
            current_path = line["worktree ".len()..].to_string();
            current_head = String::new();
            current_branch = String::new();
            is_bare = false;
        } else if line.starts_with("HEAD ") {
            current_head = line["HEAD ".len()..].to_string();
        } else if line.starts_with("branch ") {
            let full = &line["branch ".len()..];
            current_branch = full.trim_start_matches("refs/heads/").to_string();
        } else if line == "bare" {
            is_bare = true;
        }
    }
    if !current_path.is_empty() && !is_bare && current_path != local_path {
        result.push(WorktreeInfo {
            path: current_path,
            branch: current_branch,
            head: current_head,
        });
    }

    Ok(result)
}

#[tauri::command]
pub fn remove_worktree(local_path: String, worktree_path: String) -> Result<(), String> {
    let out = std::process::Command::new("git")
        .args(["worktree", "remove", "--force", &worktree_path])
        .current_dir(&local_path)
        .output()
        .map_err(|e| format!("git worktree remove failed: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).into_owned());
    }
    Ok(())
}

#[tauri::command]
pub fn create_worktree_from_patch(
    local_path: String,
    worktree_path: String,
    branch_name: String,
    commit_oid: String,
) -> Result<(), String> {
    let output = std::process::Command::new("git")
        .args(["worktree", "add", "-b", &branch_name, &worktree_path, &commit_oid])
        .current_dir(&local_path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn update_worktree(worktree_path: String, commit_oid: String) -> Result<(), String> {
    let output = std::process::Command::new("git")
        .args(["reset", "--hard", &commit_oid])
        .current_dir(&worktree_path)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn get_worktree_diff(worktree_path: String, files: Vec<String>) -> Result<String, String> {
    if files.is_empty() {
        return Ok(String::new());
    }

    // Determine which files are untracked vs tracked by checking git status.
    let status_out = std::process::Command::new("git")
        .args(["status", "--porcelain", "--"])
        .args(&files)
        .current_dir(&worktree_path)
        .output()
        .map_err(|e| format!("git status failed: {e}"))?;

    let status_text = String::from_utf8_lossy(&status_out.stdout);
    let untracked: std::collections::HashSet<&str> = status_text
        .lines()
        .filter(|l| l.len() >= 3 && &l[..2] == "??")
        .map(|l| l[3..].trim())
        .collect();

    let tracked: Vec<&str> = files.iter()
        .map(|f| f.as_str())
        .filter(|f| !untracked.contains(f))
        .collect();

    let mut result = String::new();

    // Diff for tracked / modified files
    if !tracked.is_empty() {
        let out = std::process::Command::new("git")
            .args(["diff", "HEAD", "--"])
            .args(&tracked)
            .current_dir(&worktree_path)
            .output()
            .map_err(|e| format!("git diff failed: {e}"))?;
        result.push_str(&String::from_utf8_lossy(&out.stdout));
    }

    // Diff for untracked (new) files — show full content as additions
    for file in &files {
        if untracked.contains(file.as_str()) {
            let out = std::process::Command::new("git")
                .args(["diff", "--no-index", "/dev/null", file.as_str()])
                .current_dir(&worktree_path)
                .output()
                .map_err(|e| format!("git diff --no-index failed: {e}"))?;
            // git diff --no-index exits with code 1 when files differ (normal), so ignore exit code
            result.push_str(&String::from_utf8_lossy(&out.stdout));
        }
    }

    Ok(result)
}

#[tauri::command]
pub fn get_worktree_status(worktree_path: String) -> Result<Vec<FileStatus>, String> {
    let output = std::process::Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&worktree_path)
        .output()
        .map_err(|e| format!("git error: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let files = text.lines()
        .filter(|l| l.len() >= 3)
        .map(|l| FileStatus {
            status: l[..2].to_string(),
            path: l[3..].to_string(),
        })
        .collect();

    Ok(files)
}

#[tauri::command]
pub fn commit_and_create_patch(
    worktree_path: String,
    files: Vec<String>,
    commit_message: String,
    patch_title: String,
    patch_description: String,
) -> Result<(), String> {
    let dir = &worktree_path;

    // git add <files>
    let add = std::process::Command::new("git")
        .arg("add").arg("--").args(&files)
        .current_dir(dir)
        .output()
        .map_err(|e| format!("git add failed: {e}"))?;
    if !add.status.success() {
        return Err(String::from_utf8_lossy(&add.stderr).into_owned());
    }

    // git commit -m <msg>
    let commit = std::process::Command::new("git")
        .args(["commit", "-m", &commit_message])
        .current_dir(dir)
        .output()
        .map_err(|e| format!("git commit failed: {e}"))?;
    if !commit.status.success() {
        return Err(String::from_utf8_lossy(&commit.stderr).into_owned());
    }

    // Write patch message (first line = title, rest = description) to temp file.
    // Then use GIT_EDITOR = a script that copies our file into git's temp file,
    // so `git push rad HEAD:refs/patches` picks it up without opening a real editor.
    let tmp_dir = std::env::temp_dir();
    let msg_file = tmp_dir.join("radboard-patch-msg.txt");
    let content = if patch_description.trim().is_empty() {
        format!("{}\n", patch_title)
    } else {
        format!("{}\n\n{}\n", patch_title, patch_description)
    };
    std::fs::write(&msg_file, &content).map_err(|e| format!("write temp msg: {e}"))?;

    let editor_script = tmp_dir.join("radboard-editor.sh");
    std::fs::write(
        &editor_script,
        format!("#!/bin/sh\ncp '{}' \"$1\"\n", msg_file.display()),
    ).map_err(|e| format!("write editor script: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&editor_script,
            std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("chmod editor script: {e}"))?;
    }

    // git push rad HEAD:refs/patches  (opens a new Radicle patch)
    let push = std::process::Command::new("git")
        .args(["push", "rad", "HEAD:refs/patches"])
        .env("GIT_EDITOR", &editor_script)
        .current_dir(dir)
        .output()
        .map_err(|e| format!("git push failed: {e}"))?;
    if !push.status.success() {
        return Err(String::from_utf8_lossy(&push.stderr).into_owned());
    }

    Ok(())
}

#[tauri::command]
pub fn commit_and_update_patch(
    worktree_path: String,
    files: Vec<String>,
    commit_message: String,
    patch_id: String,   // full patch ID (40-char SHA)
    amend: bool,
) -> Result<(), String> {
    let dir = &worktree_path;

    if !files.is_empty() {
        let add = std::process::Command::new("git")
            .arg("add").arg("--").args(&files)
            .current_dir(dir)
            .output()
            .map_err(|e| format!("git add failed: {e}"))?;
        if !add.status.success() {
            return Err(String::from_utf8_lossy(&add.stderr).into_owned());
        }
    }

    if !files.is_empty() || amend {
        let mut args = vec!["commit"];
        if amend { args.push("--amend"); }
        args.extend(["-m", &commit_message]);
        let commit = std::process::Command::new("git")
            .args(&args)
            .current_dir(dir)
            .output()
            .map_err(|e| format!("git commit failed: {e}"))?;
        if !commit.status.success() {
            return Err(String::from_utf8_lossy(&commit.stderr).into_owned());
        }
    }

    // Push to the patch head ref — Radicle's hook creates a new revision from this push.
    // The correct ref is refs/heads/patches/<id> (not refs/patches/<id>).
    // --force is needed for amended commits; Radicle handles it safely by creating immutable revisions.
    let refspec = format!("HEAD:refs/heads/patches/{}", patch_id);
    let push = std::process::Command::new("git")
        .args(["push", "--force", "rad", &refspec])
        .current_dir(dir)
        .output()
        .map_err(|e| format!("git push failed: {e}"))?;
    if !push.status.success() {
        return Err(String::from_utf8_lossy(&push.stderr).into_owned());
    }

    Ok(())
}

#[tauri::command]
pub fn get_head_commit_message(worktree_path: String) -> Result<String, String> {
    let out = std::process::Command::new("git")
        .args(["log", "-1", "--pretty=%B"])
        .current_dir(&worktree_path)
        .output()
        .map_err(|e| format!("git log failed: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).into_owned());
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_owned())
}

#[tauri::command]
pub fn open_in_editor(editor: String, path: String) -> Result<(), String> {
    std::process::Command::new(&editor)
        .arg(&path)
        .spawn()
        .map_err(|e| format!("failed to launch '{}': {}", editor, e))?;
    Ok(())
}
