use radicle::identity::IdError;
use radicle::profile::Profile;
use radicle::storage::{ReadRepository as _, ReadStorage as _};

use crate::types::{BlameHunkData, BlobContentData, CommitEntry, FileLogEntry, TreeEntryData};

#[tauri::command]
pub fn resolve_ref(rid: String, ref_name: String) -> Result<String, String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid_parsed: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository(rid_parsed).map_err(|e| e.to_string())?;

    // Try direct lookup first
    if let Ok(reference) = repo.backend.find_reference(&ref_name) {
        let commit = reference.peel_to_commit().map_err(|e| e.to_string())?;
        return Ok(commit.id().to_string());
    }

    // For tag refs, try namespaced form: refs/namespaces/*/refs/tags/<name>
    if ref_name.starts_with("refs/tags/") {
        let tag_part = &ref_name["refs/tags/".len()..];
        let glob = format!("refs/namespaces/*/refs/tags/{}", tag_part);
        let refs = repo.backend.references_glob(&glob).map_err(|e| e.to_string())?;
        for reference in refs.flatten() {
            if let Ok(commit) = reference.peel_to_commit() {
                return Ok(commit.id().to_string());
            }
        }
    }

    Err(format!("ref not found: {}", ref_name))
}

#[tauri::command]
pub fn list_tree(rid: String, path: String, commit_oid: String) -> Result<Vec<TreeEntryData>, String> {
    use radicle::git::raw::{ObjectType, Oid as RawOid};

    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository(rid).map_err(|e| e.to_string())?;
    let backend = &repo.backend;

    let commit_id: RawOid = if commit_oid.is_empty() {
        let (_, oid) = repo.canonical_head().map_err(|e| e.to_string())?;
        oid.into()
    } else {
        commit_oid.parse::<RawOid>().map_err(|e| e.to_string())?
    };

    let commit = backend.find_commit(commit_id).map_err(|e| e.to_string())?;
    let tree = commit.tree().map_err(|e| e.to_string())?;

    let target_tree = if path.is_empty() {
        tree
    } else {
        let entry = tree
            .get_path(std::path::Path::new(&path))
            .map_err(|e| e.to_string())?;
        backend
            .find_tree(entry.id())
            .map_err(|e| e.to_string())?
    };

    let mut dirs = Vec::new();
    let mut files = Vec::new();

    for entry in target_tree.iter() {
        let name = entry.name().unwrap_or("").to_string();
        let oid = entry.id().to_string();
        match entry.kind() {
            Some(ObjectType::Tree) => {
                dirs.push(TreeEntryData {
                    name,
                    kind: "tree".to_string(),
                    oid,
                    size: None,
                });
            }
            Some(ObjectType::Blob) => {
                let size = backend.find_blob(entry.id()).ok().map(|b| b.size() as u64);
                files.push(TreeEntryData {
                    name,
                    kind: "blob".to_string(),
                    oid,
                    size,
                });
            }
            _ => {}
        }
    }

    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    dirs.append(&mut files);
    Ok(dirs)
}

#[tauri::command]
pub fn read_blob(rid: String, path: String, commit_oid: String) -> Result<BlobContentData, String> {
    use radicle::git::raw::Oid as RawOid;

    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository(rid).map_err(|e| e.to_string())?;
    let backend = &repo.backend;

    let commit_id: RawOid = if commit_oid.is_empty() {
        let (_, oid) = repo.canonical_head().map_err(|e| e.to_string())?;
        oid.into()
    } else {
        commit_oid.parse::<RawOid>().map_err(|e| e.to_string())?
    };

    let commit = backend.find_commit(commit_id).map_err(|e| e.to_string())?;
    let tree = commit.tree().map_err(|e| e.to_string())?;
    let entry = tree
        .get_path(std::path::Path::new(&path))
        .map_err(|e| e.to_string())?;
    let blob = backend.find_blob(entry.id()).map_err(|e| e.to_string())?;

    let raw = blob.content();
    let size = raw.len() as u64;
    let max_size: usize = 1_048_576; // 1 MB

    // Binary detection: check first 8KB for null bytes
    let check_len = raw.len().min(8192);
    let is_binary = raw[..check_len].contains(&0);

    if is_binary {
        return Ok(BlobContentData {
            content: String::new(),
            size,
            is_binary: true,
            is_truncated: false,
        });
    }

    let is_truncated = raw.len() > max_size;
    let slice = if is_truncated { &raw[..max_size] } else { raw };
    let content = String::from_utf8_lossy(slice).into_owned();

    Ok(BlobContentData {
        content,
        size,
        is_binary,
        is_truncated,
    })
}

#[tauri::command]
pub fn file_log(rid: String, path: String, commit_oid: String) -> Result<Vec<FileLogEntry>, String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid_parsed: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository(rid_parsed).map_err(|e| e.to_string())?;
    let git_dir = repo.path();

    let rev = if commit_oid.is_empty() {
        "HEAD".to_string()
    } else {
        commit_oid
    };

    // %H = full hash, %an = author name, %at = author epoch, %s = subject
    let output = std::process::Command::new("git")
        .args([
            "log", "--follow", "--format=%H%x00%an%x00%at%x00%s",
            &rev, "--", &path,
        ])
        .env("GIT_DIR", git_dir)
        .current_dir(std::env::temp_dir())
        .output()
        .map_err(|e| format!("git log failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git log failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let entries: Vec<FileLogEntry> = stdout
        .lines()
        .filter(|l| !l.is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(4, '\0').collect();
            if parts.len() == 4 {
                Some(FileLogEntry {
                    oid: parts[0].to_string(),
                    author: parts[1].to_string(),
                    timestamp: parts[2].parse().unwrap_or(0),
                    summary: parts[3].to_string(),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(entries)
}

#[tauri::command]
pub fn get_blame(rid: String, path: String, commit_oid: String) -> Result<Vec<BlameHunkData>, String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid_parsed: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository(rid_parsed).map_err(|e| e.to_string())?;
    let git_dir = repo.path();

    let rev = if commit_oid.is_empty() {
        "HEAD".to_string()
    } else {
        commit_oid
    };

    let output = std::process::Command::new("git")
        .args(["blame", "--porcelain", &rev, "--", &path])
        .env("GIT_DIR", git_dir)
        .current_dir(std::env::temp_dir())
        .output()
        .map_err(|e| format!("git blame failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git blame failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Parse porcelain format into hunks.
    // Each block starts with "<sha> <orig_line> <final_line> [<num_lines>]"
    // followed by header lines, then a TAB-prefixed content line.
    // We coalesce consecutive lines from the same commit into hunks.
    let mut hunks: Vec<BlameHunkData> = Vec::new();
    let mut current_sha = String::new();
    let mut current_author = String::new();
    let mut current_timestamp: u64 = 0;
    let mut current_summary = String::new();
    let mut current_line: u32 = 0;

    for line in stdout.lines() {
        if line.starts_with('\t') {
            // Content line — emit/extend hunk
            if let Some(last) = hunks.last_mut() {
                if last.commit_oid == current_sha
                    && last.start_line + last.line_count == current_line
                {
                    last.line_count += 1;
                    continue;
                }
            }
            hunks.push(BlameHunkData {
                commit_oid: current_sha.clone(),
                author: current_author.clone(),
                timestamp: current_timestamp,
                summary: current_summary.clone(),
                start_line: current_line,
                line_count: 1,
            });
        } else if let Some(rest) = line.strip_prefix("author ") {
            current_author = rest.to_string();
        } else if let Some(rest) = line.strip_prefix("author-time ") {
            current_timestamp = rest.parse().unwrap_or(0);
        } else if let Some(rest) = line.strip_prefix("summary ") {
            current_summary = rest.to_string();
        } else {
            // Header line: "<sha> <orig> <final> [<count>]"
            let parts: Vec<&str> = line.splitn(4, ' ').collect();
            if parts.len() >= 3 && parts[0].len() == 40 && parts[0].chars().all(|c| c.is_ascii_hexdigit()) {
                current_sha = parts[0].to_string();
                current_line = parts[2].parse().unwrap_or(1);
            }
        }
    }

    Ok(hunks)
}

#[tauri::command]
pub fn count_commits(rid: String, commit_oid: String) -> Result<u64, String> {
    use radicle::git::raw::Oid as RawOid;

    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid_parsed: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository(rid_parsed).map_err(|e| e.to_string())?;
    let backend = &repo.backend;

    let start: RawOid = if commit_oid.is_empty() {
        let (_, oid) = repo.canonical_head().map_err(|e| e.to_string())?;
        oid.into()
    } else {
        commit_oid.parse::<RawOid>().map_err(|e| e.to_string())?
    };

    let mut revwalk = backend.revwalk().map_err(|e| e.to_string())?;
    revwalk.push(start).map_err(|e| e.to_string())?;
    Ok(revwalk.count() as u64)
}

#[tauri::command]
pub fn list_commits(rid: String, commit_oid: String, offset: usize, limit: usize) -> Result<Vec<CommitEntry>, String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid_parsed: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository(rid_parsed).map_err(|e| e.to_string())?;
    let git_dir = repo.path();

    let rev = if commit_oid.is_empty() { "HEAD".to_string() } else { commit_oid };

    // %H=full oid, %s=subject, %an=author name, %at=author epoch, %cn=committer name, %ct=committer epoch
    let output = std::process::Command::new("git")
        .args([
            "log",
            "--format=%H%x00%s%x00%an%x00%at%x00%cn%x00%ct",
            &format!("--skip={offset}"),
            &format!("--max-count={limit}"),
            &rev,
        ])
        .env("GIT_DIR", git_dir)
        .current_dir(std::env::temp_dir())
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let mut result = Vec::new();
    for line in text.lines() {
        let parts: Vec<&str> = line.splitn(6, '\x00').collect();
        if parts.len() < 6 { continue; }
        result.push(CommitEntry {
            oid: parts[0].to_string(),
            summary: parts[1].to_string(),
            author: parts[2].to_string(),
            author_timestamp: parts[3].parse().unwrap_or(0),
            committer: parts[4].to_string(),
            committer_timestamp: parts[5].parse().unwrap_or(0),
        });
    }
    Ok(result)
}
