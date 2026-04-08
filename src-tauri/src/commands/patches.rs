use radicle::cob::common::Reaction;
use radicle::cob::patch::Patches;
use radicle::cob::thread::CommentId;
use radicle::identity::IdError;
use radicle::prelude::Did;
use radicle::profile::Profile;
use radicle::storage::{ReadRepository as _, ReadStorage as _, WriteStorage as _};

use crate::helpers::{announce_refs, build_patch_comments, pick_revision, resolve_author};
use crate::types::{PatchData, PatchDetailData, PatchRevisionRef, PatchReviewData};

#[tauri::command]
pub async fn list_patches(rid: String) -> Result<Vec<PatchData>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let profile = Profile::load().map_err(|e| e.to_string())?;
        let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
        let repo = profile.storage.repository(rid).map_err(|e| e.to_string())?;
        let patches = Patches::open(&repo).map_err(|e| e.to_string())?;

        let mut all: Vec<_> = patches
            .all()
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        all.sort_by(|a, b| b.1.timestamp().as_millis().cmp(&a.1.timestamp().as_millis()));

        let mut items = Vec::new();
        for (id, patch) in all {
            let state = match patch.state() {
                radicle::cob::patch::State::Open { .. }   => "open",
                radicle::cob::patch::State::Draft          => "draft",
                radicle::cob::patch::State::Archived       => "archived",
                radicle::cob::patch::State::Merged { .. } => "merged",
            };
            let head = patch.revisions().last()
                .map(|(_, rev)| rev.head().to_string())
                .unwrap_or_default();
            items.push(PatchData {
                id: id.to_string(),
                title: patch.title().to_owned(),
                description: patch.description().to_owned(),
                author: resolve_author(&profile, *patch.author().public_key()),
                author_did: Did::from(*patch.author().public_key()).to_string(),
                state: state.to_owned(),
                created_at: patch.timestamp().as_millis() as u64,
                head,
            });
        }
        Ok(items)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn get_patch_detail(rid: String, patch_id: String, revision_id: String) -> Result<PatchDetailData, String> {
    use radicle::cob::patch::Verdict;
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository(rid).map_err(|e| e.to_string())?;
    let patches = Patches::open(&repo).map_err(|e| e.to_string())?;

    let oid = patch_id.parse::<radicle::cob::ObjectId>().map_err(|e| e.to_string())?;
    let patch = patches.get(&oid).map_err(|e| e.to_string())?
        .ok_or_else(|| "patch not found".to_string())?;

    let state = match patch.state() {
        radicle::cob::patch::State::Open { .. }   => "open",
        radicle::cob::patch::State::Draft          => "draft",
        radicle::cob::patch::State::Archived       => "archived",
        radicle::cob::patch::State::Merged { .. } => "merged",
    };

    let revisions: Vec<PatchRevisionRef> = patch.revisions().map(|(id, rev)| {
        PatchRevisionRef {
            id: id.to_string(),
            description: rev.description().to_owned(),
            created_at: rev.timestamp().as_millis() as u64,
            head: rev.head().to_string(),
            base: rev.base().to_string(),
            author: resolve_author(&profile, *rev.author().public_key()),
            author_did: Did::from(*rev.author().public_key()).to_string(),
        }
    }).collect();

    let (rev_id, revision): (radicle::cob::patch::RevisionId, &radicle::cob::patch::Revision) =
        pick_revision(&patch, &revision_id)?;

    let reviews = patch.reviews_of(rev_id).map(|(_, review)| {
        PatchReviewData {
            reviewer: resolve_author(&profile, *review.author().public_key()),
            reviewer_did: review.author().id().to_string(),
            verdict: review.verdict().map(|v| match v {
                Verdict::Accept => "accept".to_owned(),
                Verdict::Reject => "reject".to_owned(),
            }),
            summary: review.summary().to_owned(),
            created_at: review.timestamp().as_millis() as u64,
        }
    }).collect();

    let discussion = revision.discussion();
    let comments = build_patch_comments(&profile, discussion, None);

    Ok(PatchDetailData {
        id: oid.to_string(),
        title: patch.title().to_owned(),
        description: patch.description().to_owned(),
        author: resolve_author(&profile, *patch.author().public_key()),
        author_did: Did::from(*patch.author().public_key()).to_string(),
        state: state.to_owned(),
        created_at: patch.timestamp().as_millis() as u64,
        revision_id: rev_id.to_string(),
        revisions,
        comments,
        reviews,
    })
}

#[tauri::command]
pub fn get_patch_diff(rid: String, patch_id: String, revision_id: String) -> Result<String, String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid_parsed: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository(rid_parsed).map_err(|e| e.to_string())?;
    let patches = Patches::open(&repo).map_err(|e| e.to_string())?;

    let patch_oid: radicle::cob::ObjectId = patch_id
        .parse::<radicle::cob::ObjectId>()
        .map_err(|e| e.to_string())?;

    let patch = patches
        .get(&patch_oid)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "patch not found".to_string())?;

    let (_, revision) = pick_revision(&patch, &revision_id)?;

    let base = revision.base().to_string();
    let head = revision.head().to_string();

    // Use the repo's git directory (bare storage repo has all objects)
    let git_dir = repo.path();
    let output = std::process::Command::new("git")
        .args(["diff", &base, &head])
        .env("GIT_DIR", git_dir)
        .current_dir(std::env::temp_dir())
        .output()
        .map_err(|e| format!("git diff failed: {e}"))?;

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[tauri::command]
pub fn add_patch_comment(rid: String, patch_id: String, revision_id: String, body: String) -> Result<(), String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository_mut(rid).map_err(|e| e.to_string())?;
    let signer = profile.signer().map_err(|e| e.to_string())?;
    let oid = patch_id.parse::<radicle::cob::ObjectId>().map_err(|e| e.to_string())?;
    let mut patches = profile.patches_mut(&repo).map_err(|e| e.to_string())?;
    let mut patch = patches.get_mut(&oid).map_err(|e| e.to_string())?;
    let (rev_id, _) = pick_revision(&patch, &revision_id)?;
    patch.comment(rev_id, body, None, None, vec![], &signer).map_err(|e| e.to_string())?;
    announce_refs(&profile, rid);
    Ok(())
}

#[tauri::command]
pub fn reply_patch_comment(rid: String, patch_id: String, revision_id: String, comment_id: String, body: String) -> Result<(), String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository_mut(rid).map_err(|e| e.to_string())?;
    let signer = profile.signer().map_err(|e| e.to_string())?;
    let oid = patch_id.parse::<radicle::cob::ObjectId>().map_err(|e| e.to_string())?;
    let comment_id = comment_id.parse::<CommentId>().map_err(|e| e.to_string())?;
    let mut patches = profile.patches_mut(&repo).map_err(|e| e.to_string())?;
    let mut patch = patches.get_mut(&oid).map_err(|e| e.to_string())?;
    let (rev_id, _) = pick_revision(&patch, &revision_id)?;
    patch.comment(rev_id, body, Some(comment_id), None, vec![], &signer).map_err(|e| e.to_string())?;
    announce_refs(&profile, rid);
    Ok(())
}

#[tauri::command]
pub fn react_patch_comment(rid: String, patch_id: String, revision_id: String, emoji: String, active: bool) -> Result<(), String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository_mut(rid).map_err(|e| e.to_string())?;
    let signer = profile.signer().map_err(|e| e.to_string())?;
    let oid = patch_id.parse::<radicle::cob::ObjectId>().map_err(|e| e.to_string())?;
    let first_char = emoji.chars().next().ok_or("empty emoji")?;
    let reaction = Reaction::new(first_char).map_err(|e| e.to_string())?;
    let mut patches = profile.patches_mut(&repo).map_err(|e| e.to_string())?;
    let mut patch = patches.get_mut(&oid).map_err(|e| e.to_string())?;
    let (rev_id, _) = pick_revision(&patch, &revision_id)?;
    patch.react(rev_id, reaction, None, active, &signer).map_err(|e| e.to_string())?;
    announce_refs(&profile, rid);
    Ok(())
}

#[tauri::command]
pub fn review_patch(rid: String, patch_id: String, revision_id: String, verdict: String, message: String) -> Result<(), String> {
    use radicle::cob::patch::Verdict;
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository_mut(rid).map_err(|e| e.to_string())?;
    let signer = profile.signer().map_err(|e| e.to_string())?;
    let oid = patch_id.parse::<radicle::cob::ObjectId>().map_err(|e| e.to_string())?;
    let mut patches = profile.patches_mut(&repo).map_err(|e| e.to_string())?;
    let mut patch = patches.get_mut(&oid).map_err(|e| e.to_string())?;

    let v = match verdict.as_str() {
        "accept" => Some(Verdict::Accept),
        "reject" => Some(Verdict::Reject),
        _ => None,
    };
    let msg = if message.trim().is_empty() { None } else { Some(message) };
    let (rev_id, _) = pick_revision(&patch, &revision_id)?;

    patch.review(rev_id, v, msg, vec![], &signer).map_err(|e| e.to_string())?;
    announce_refs(&profile, rid);
    Ok(())
}

#[tauri::command]
pub fn add_patch_line_comment(
    rid: String,
    patch_id: String,
    revision_id: String,
    body: String,
    reply_to: Option<String>,
    commit_oid: String,
    file_path: String,
    new_line: Option<u32>,
    old_line: Option<u32>,
) -> Result<(), String> {
    use radicle::cob::CodeLocation;
    use radicle::cob::CodeRange;
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository_mut(rid).map_err(|e| e.to_string())?;
    let signer = profile.signer().map_err(|e| e.to_string())?;
    let oid = patch_id.parse::<radicle::cob::ObjectId>().map_err(|e| e.to_string())?;
    let mut patches = profile.patches_mut(&repo).map_err(|e| e.to_string())?;
    let mut patch = patches.get_mut(&oid).map_err(|e| e.to_string())?;
    let (rev_id, _) = pick_revision(&patch, &revision_id)?;
    let commit: radicle::git::Oid = commit_oid.parse().map_err(|e: radicle::git::ParseOidError| e.to_string())?;
    let new_range = new_line.map(|l| CodeRange::Lines { range: (l as usize)..(l as usize + 1) });
    let old_range = old_line.map(|l| CodeRange::Lines { range: (l as usize)..(l as usize + 1) });
    let location = CodeLocation {
        commit,
        path: std::path::PathBuf::from(&file_path),
        new: new_range,
        old: old_range,
    };
    let reply_oid = reply_to.map(|r| r.parse::<CommentId>().map_err(|e| e.to_string())).transpose()?;
    patch.comment(rev_id, body, reply_oid, Some(location), vec![] as Vec<radicle::cob::Embed<radicle::cob::Uri>>, &signer)
        .map_err(|e| e.to_string())?;
    announce_refs(&profile, rid);
    Ok(())
}

#[tauri::command]
pub fn archive_patch(rid: String, patch_id: String) -> Result<(), String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository_mut(rid).map_err(|e| e.to_string())?;
    let signer = profile.signer().map_err(|e| e.to_string())?;
    let oid = patch_id.parse::<radicle::cob::ObjectId>().map_err(|e| e.to_string())?;
    let mut patches = profile.patches_mut(&repo).map_err(|e| e.to_string())?;
    let mut patch = patches.get_mut(&oid).map_err(|e| e.to_string())?;
    patch.archive(&signer).map_err(|e| e.to_string())?;
    announce_refs(&profile, rid);
    Ok(())
}

#[tauri::command]
pub fn merge_patch(local_repo_path: String, default_branch: String, patch_head: String) -> Result<(), String> {
    let dir = &local_repo_path;

    let checkout = std::process::Command::new("git")
        .args(["checkout", &default_branch])
        .current_dir(dir)
        .output()
        .map_err(|e| format!("git checkout failed: {e}"))?;
    if !checkout.status.success() {
        return Err(String::from_utf8_lossy(&checkout.stderr).into_owned());
    }

    let merge = std::process::Command::new("git")
        .args(["merge", &patch_head])
        .current_dir(dir)
        .output()
        .map_err(|e| format!("git merge failed: {e}"))?;
    if !merge.status.success() {
        return Err(String::from_utf8_lossy(&merge.stderr).into_owned());
    }

    let push = std::process::Command::new("git")
        .args(["push", "rad", &default_branch])
        .current_dir(dir)
        .output()
        .map_err(|e| format!("git push failed: {e}"))?;
    if !push.status.success() {
        return Err(String::from_utf8_lossy(&push.stderr).into_owned());
    }

    Ok(())
}
