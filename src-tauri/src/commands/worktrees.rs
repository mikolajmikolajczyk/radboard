use crate::types::{FileStatus, PatchCommitEntry, WorktreeInfo};

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
        .args(["status", "--porcelain", "--untracked-files=all"])
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

#[tauri::command]
pub fn push_create_patch(
    worktree_path: String,
    patch_title: String,
    patch_description: String,
) -> Result<(), String> {
    let dir = &worktree_path;
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
    )
    .map_err(|e| format!("write editor script: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&editor_script, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("chmod editor script: {e}"))?;
    }

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
pub fn discard_worktree_file(worktree_path: String, file_path: String, status: String) -> Result<(), String> {
    let dir = &worktree_path;
    let s = status.trim();

    if s == "??" {
        // Untracked file — delete from disk
        let full = std::path::Path::new(dir).join(&file_path);
        std::fs::remove_file(&full).map_err(|e| format!("delete failed: {e}"))?;
    } else {
        // Tracked file — restore to HEAD version
        let out = std::process::Command::new("git")
            .args(["checkout", "HEAD", "--", &file_path])
            .current_dir(dir)
            .output()
            .map_err(|e| format!("git checkout failed: {e}"))?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).into_owned());
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Patch commit management commands
// ---------------------------------------------------------------------------

fn parse_commit_log(worktree_path: &str, range: &str) -> Result<Vec<PatchCommitEntry>, String> {
    let out = std::process::Command::new("git")
        .args(["log", "--format=%H%x00%h%x00%s%x00%at", "--reverse", range])
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("git log failed: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).into_owned());
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let entries = text
        .lines()
        .filter(|l| !l.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(4, '\0').collect();
            if parts.len() < 4 {
                return None;
            }
            Some(PatchCommitEntry {
                oid: parts[0].to_string(),
                short_oid: parts[1].to_string(),
                summary: parts[2].to_string(),
                timestamp: parts[3].parse().unwrap_or(0),
            })
        })
        .collect();
    Ok(entries)
}

#[tauri::command]
pub fn get_patch_commits(
    worktree_path: String,
    base_branch: String,
) -> Result<Vec<PatchCommitEntry>, String> {
    let range = format!("{base_branch}..HEAD");
    parse_commit_log(&worktree_path, &range)
}

#[tauri::command]
pub fn get_commit_diff(
    worktree_path: String,
    commit_oid: String,
) -> Result<String, String> {
    // Check if the commit has a parent
    let check = std::process::Command::new("git")
        .args(["rev-parse", "--verify", &format!("{commit_oid}^")])
        .current_dir(&worktree_path)
        .output()
        .map_err(|e| format!("git rev-parse failed: {e}"))?;

    let out = if check.status.success() {
        // Has parent — normal diff
        std::process::Command::new("git")
            .args(["diff", &format!("{commit_oid}~1..{commit_oid}")])
            .current_dir(&worktree_path)
            .output()
            .map_err(|e| format!("git diff failed: {e}"))?
    } else {
        // Root commit — diff against empty tree
        std::process::Command::new("git")
            .args(["diff", "--root", &commit_oid])
            .current_dir(&worktree_path)
            .output()
            .map_err(|e| format!("git diff failed: {e}"))?
    };
    if !out.status.success() {
        // git diff --root with a non-root may fail; try show instead
        let show = std::process::Command::new("git")
            .args(["show", "--format=", &commit_oid])
            .current_dir(&worktree_path)
            .output()
            .map_err(|e| format!("git show failed: {e}"))?;
        return Ok(String::from_utf8_lossy(&show.stdout).into_owned());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

#[tauri::command]
pub fn commit_staged_files(
    worktree_path: String,
    files: Vec<String>,
    commit_message: String,
) -> Result<PatchCommitEntry, String> {
    let dir = &worktree_path;

    // git add -- <files>
    let add = std::process::Command::new("git")
        .arg("add")
        .arg("--")
        .args(&files)
        .current_dir(dir)
        .output()
        .map_err(|e| format!("git add failed: {e}"))?;
    if !add.status.success() {
        return Err(String::from_utf8_lossy(&add.stderr).into_owned());
    }

    // git commit
    let commit = std::process::Command::new("git")
        .args(["commit", "-m", &commit_message])
        .current_dir(dir)
        .output()
        .map_err(|e| format!("git commit failed: {e}"))?;
    if !commit.status.success() {
        return Err(String::from_utf8_lossy(&commit.stderr).into_owned());
    }

    // Read back the new HEAD commit info
    let out = std::process::Command::new("git")
        .args(["log", "-1", "--format=%H%x00%h%x00%s%x00%at"])
        .current_dir(dir)
        .output()
        .map_err(|e| format!("git log failed: {e}"))?;
    let text = String::from_utf8_lossy(&out.stdout);
    let parts: Vec<&str> = text.trim().splitn(4, '\0').collect();
    if parts.len() < 4 {
        return Err("failed to parse new commit".into());
    }
    Ok(PatchCommitEntry {
        oid: parts[0].to_string(),
        short_oid: parts[1].to_string(),
        summary: parts[2].to_string(),
        timestamp: parts[3].parse().unwrap_or(0),
    })
}

#[tauri::command]
pub fn uncommit_head(worktree_path: String) -> Result<(), String> {
    let out = std::process::Command::new("git")
        .args(["reset", "HEAD~1", "--mixed"])
        .current_dir(&worktree_path)
        .output()
        .map_err(|e| format!("git reset failed: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).into_owned());
    }
    Ok(())
}

#[tauri::command]
pub fn rewrite_commit_message(
    worktree_path: String,
    commit_oid: String,
    new_message: String,
    base_branch: String,
) -> Result<Vec<PatchCommitEntry>, String> {
    let dir = &worktree_path;

    // Check if the commit is HEAD
    let head_out = std::process::Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(dir)
        .output()
        .map_err(|e| format!("git rev-parse failed: {e}"))?;
    let head_oid = String::from_utf8_lossy(&head_out.stdout).trim().to_string();
    let is_head = head_oid == commit_oid;

    if is_head {
        let out = std::process::Command::new("git")
            .args(["commit", "--amend", "--allow-empty", "-m", &new_message])
            .current_dir(dir)
            .output()
            .map_err(|e| format!("git commit --amend failed: {e}"))?;
        if !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).into_owned());
        }
    } else {
        run_scripted_rebase(dir, &commit_oid, &new_message, "reword", &base_branch)?;
    }

    let range = format!("{base_branch}..HEAD");
    parse_commit_log(dir, &range)
}

#[tauri::command]
pub fn squash_commits(
    worktree_path: String,
    target_oid: String,
    source_oid: String,
    new_message: String,
    base_branch: String,
) -> Result<Vec<PatchCommitEntry>, String> {
    let dir = &worktree_path;
    let tmp_dir = std::env::temp_dir();

    // Write the sequence editor script: changes source's "pick" to "squash"
    let short_source = &source_oid[..7.min(source_oid.len())];
    let seq_script = tmp_dir.join("radboard-seq-editor.sh");
    std::fs::write(
        &seq_script,
        format!(
            "#!/bin/sh\nsed -i 's/^pick {short_source}/squash {short_source}/' \"$1\"\n"
        ),
    )
    .map_err(|e| format!("write seq editor script: {e}"))?;

    // Write the editor script for the squash message
    let msg_file = tmp_dir.join("radboard-squash-msg.txt");
    std::fs::write(&msg_file, &new_message)
        .map_err(|e| format!("write squash msg: {e}"))?;

    let editor_script = tmp_dir.join("radboard-editor.sh");
    std::fs::write(
        &editor_script,
        format!("#!/bin/sh\ncp '{}' \"$1\"\n", msg_file.display()),
    )
    .map_err(|e| format!("write editor script: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        std::fs::set_permissions(&seq_script, perms.clone())
            .map_err(|e| format!("chmod seq script: {e}"))?;
        std::fs::set_permissions(&editor_script, perms)
            .map_err(|e| format!("chmod editor script: {e}"))?;
    }

    let out = std::process::Command::new("git")
        .args(["rebase", "-i", &format!("{target_oid}~1")])
        .env("GIT_SEQUENCE_EDITOR", &seq_script)
        .env("GIT_EDITOR", &editor_script)
        .current_dir(dir)
        .output()
        .map_err(|e| format!("git rebase failed: {e}"))?;

    if !out.status.success() {
        // Abort the failed rebase to restore the original state
        let _ = std::process::Command::new("git")
            .args(["rebase", "--abort"])
            .current_dir(dir)
            .output();
        return Err(format!(
            "Squash failed (rebase conflict?): {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }

    let range = format!("{base_branch}..HEAD");
    parse_commit_log(dir, &range)
}

/// Helper: run a scripted interactive rebase to reword a single commit.
fn run_scripted_rebase(
    dir: &str,
    commit_oid: &str,
    new_message: &str,
    action: &str, // "reword"
    base_branch: &str,
) -> Result<(), String> {
    let tmp_dir = std::env::temp_dir();
    let short = &commit_oid[..7.min(commit_oid.len())];

    // Sequence editor: pick → reword for the target commit
    let seq_script = tmp_dir.join("radboard-seq-editor.sh");
    std::fs::write(
        &seq_script,
        format!("#!/bin/sh\nsed -i 's/^pick {short}/{action} {short}/' \"$1\"\n"),
    )
    .map_err(|e| format!("write seq script: {e}"))?;

    // Editor: writes new message
    let msg_file = tmp_dir.join("radboard-reword-msg.txt");
    std::fs::write(&msg_file, new_message).map_err(|e| format!("write msg: {e}"))?;

    let editor_script = tmp_dir.join("radboard-editor.sh");
    std::fs::write(
        &editor_script,
        format!("#!/bin/sh\ncp '{}' \"$1\"\n", msg_file.display()),
    )
    .map_err(|e| format!("write editor script: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        std::fs::set_permissions(&seq_script, perms.clone())
            .map_err(|e| format!("chmod: {e}"))?;
        std::fs::set_permissions(&editor_script, perms)
            .map_err(|e| format!("chmod: {e}"))?;
    }

    // Find the parent to use as rebase base. If the commit is the first in the
    // patch range, we need to use base_branch as the rebase onto target.
    let parent_check = std::process::Command::new("git")
        .args(["rev-parse", "--verify", &format!("{commit_oid}^")])
        .current_dir(dir)
        .output()
        .map_err(|e| format!("rev-parse parent: {e}"))?;

    let rebase_onto = if parent_check.status.success() {
        format!("{commit_oid}~1")
    } else {
        // Root commit in the patch range — use base_branch
        base_branch.to_string()
    };

    let out = std::process::Command::new("git")
        .args(["rebase", "-i", &rebase_onto])
        .env("GIT_SEQUENCE_EDITOR", &seq_script)
        .env("GIT_EDITOR", &editor_script)
        .current_dir(dir)
        .output()
        .map_err(|e| format!("git rebase failed: {e}"))?;

    if !out.status.success() {
        let _ = std::process::Command::new("git")
            .args(["rebase", "--abort"])
            .current_dir(dir)
            .output();
        return Err(format!(
            "Rewrite failed (conflict?): {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }

    Ok(())
}
