use radicle::cob::issue::Issues;
use radicle::cob::patch::Patches;
use radicle::node::notifications::{NotificationKind, NotificationStatus};
use radicle::node::AliasStore as _;
use radicle::profile::Profile;
use radicle::storage::{ReadStorage as _, RefUpdate};
use radicle_localtime::LocalTime;

use crate::helpers::resolve_author;
use crate::types::{NotificationCountData, NotificationData, NotificationKindData};

/// Try to fill in title/author/event_kind for a COB (issue or patch) notification.
/// Returns (title, author, event_kind) — all Option so failures degrade gracefully.
fn enrich_cob_notification(
    profile: &Profile,
    repo_id: radicle::prelude::RepoId,
    cob_id_str: &str,
    is_issue: bool,
    is_patch: bool,
    update_type: &str,
    notif_ts_ms: u64,
) -> (Option<String>, Option<String>, Option<String>) {
    let oid = match cob_id_str.parse::<radicle::cob::ObjectId>() {
        Ok(o) => o,
        Err(_) => return (None, None, None),
    };
    let repo = match profile.storage.repository(repo_id) {
        Ok(r) => r,
        Err(_) => return (None, None, None),
    };

    if is_issue {
        let issues = match Issues::open(&repo) {
            Ok(i) => i,
            Err(_) => return (None, None, None),
        };
        let issue = match issues.get(&oid) {
            Ok(Some(i)) => i,
            _ => return (None, None, None),
        };
        let title = issue.title().to_owned();
        if update_type == "created" {
            let auth = resolve_author(profile, *issue.author().public_key());
            return (Some(title), Some(auth), Some("new_issue".to_owned()));
        }
        let (root_id, _) = issue.root();
        let root_id = *root_id;
        let (auth, ek) = issue
            .replies_to(&root_id)
            .last()
            .map(|(_, c)| (resolve_author(profile, c.author()), "comment".to_owned()))
            .unwrap_or_else(|| (resolve_author(profile, *issue.author().public_key()), "updated".to_owned()));
        return (Some(title), Some(auth), Some(ek));
    }

    if is_patch {
        let patches = match Patches::open(&repo) {
            Ok(p) => p,
            Err(_) => return (None, None, None),
        };
        let patch = match patches.get(&oid) {
            Ok(Some(p)) => p,
            _ => return (None, None, None),
        };
        let title = patch.title().to_owned();
        if update_type == "created" {
            let auth = resolve_author(profile, *patch.author().public_key());
            return (Some(title), Some(auth), Some("new_patch".to_owned()));
        }
        // Heuristic: if the latest revision was pushed within 2 min of this notification, it's a revision event
        if let Some((_, rev)) = patch.revisions().last() {
            let rev_ts = rev.timestamp().as_millis() as u64;
            let diff = rev_ts.abs_diff(notif_ts_ms);
            if diff < 120_000 {
                let auth = resolve_author(profile, *rev.author().public_key());
                return (Some(title), Some(auth), Some("revision".to_owned()));
            }
        }
        let auth = resolve_author(profile, *patch.author().public_key());
        return (Some(title), Some(auth), Some("updated".to_owned()));
    }

    (None, None, None)
}

/// Parse `refs/tags/<name>` → tag name (namespace already stripped by radicle).
fn parse_tag_ref(refname: &str) -> Option<String> {
    refname.strip_prefix("refs/tags/").map(|s| s.to_string())
}

#[tauri::command]
pub fn list_notifications(rid: Option<String>, limit: u32) -> Result<Vec<NotificationData>, String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let db = profile.notifications_mut().map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for notif in db.all().map_err(|e| e.to_string())? {
        let n = match notif {
            Ok(n) => n,
            Err(_) => continue,
        };
        if let Some(ref r) = rid {
            if n.repo.to_string() != *r {
                continue;
            }
        }
        let repo_name = profile
            .storage
            .repository(n.repo)
            .ok()
            .and_then(|r| r.project().ok())
            .map(|p| p.name().to_owned())
            .unwrap_or_else(|| n.repo.to_string());
        // Extract COB id + type flags before consuming n.kind
        let cob_enrich: Option<(String, bool, bool)> = match &n.kind {
            NotificationKind::Cob { typed_id } => {
                Some((typed_id.id.to_string(), typed_id.is_issue(), typed_id.is_patch()))
            }
            _ => None,
        };
        // Detect tag refs before consuming n.kind (refname is already namespace-stripped)
        let tag_enrich: Option<(String, String)> = match &n.kind {
            NotificationKind::Unknown { refname } => {
                parse_tag_ref(&refname.to_string()).map(|tag_name| {
                    let author = n.remote
                        .and_then(|nid| profile.aliases().alias(&nid).map(|a| a.to_string()))
                        .unwrap_or_default();
                    (tag_name, author)
                })
            }
            _ => None,
        };
        let kind = match n.kind {
            NotificationKind::Cob { typed_id } => {
                let id_str = typed_id.id.to_string();
                if typed_id.is_issue() {
                    NotificationKindData::Issue { id: id_str }
                } else if typed_id.is_patch() {
                    NotificationKindData::Patch { id: id_str }
                } else {
                    NotificationKindData::Unknown {
                        ref_name: n.qualified.to_string(),
                    }
                }
            }
            NotificationKind::Branch { name } => {
                NotificationKindData::Branch {
                    name: name.to_string(),
                }
            }
            NotificationKind::Unknown { refname } => {
                if let Some((tag_name, tag_author)) = &tag_enrich {
                    NotificationKindData::Tag { name: tag_name.clone(), author: tag_author.clone() }
                } else {
                    NotificationKindData::Unknown { ref_name: refname.to_string() }
                }
            }
        };
        let (status, read_at) = match n.status {
            NotificationStatus::ReadAt(t) => ("read".to_owned(), Some(t.as_millis() as u64)),
            NotificationStatus::Unread => ("unread".to_owned(), None),
        };
        let update_type = match &n.update {
            RefUpdate::Updated { .. } => "updated",
            RefUpdate::Created { .. } => "created",
            RefUpdate::Deleted { .. } => "deleted",
            RefUpdate::Skipped { .. } => "skipped",
        }
        .to_owned();
        let (title, author, event_kind) = if let Some((cob_id, is_issue, is_patch)) = cob_enrich {
            enrich_cob_notification(
                &profile,
                n.repo,
                &cob_id,
                is_issue,
                is_patch,
                &update_type,
                n.timestamp.as_millis() as u64,
            )
        } else if let Some((tag_name, tag_author)) = tag_enrich {
            let ek = if update_type == "created" { Some("new_tag".to_string()) } else { None };
            (Some(tag_name), Some(tag_author), ek)
        } else {
            (None, None, None)
        };
        result.push(NotificationData {
            id: n.id,
            repo: n.repo.to_string(),
            repo_name,
            status,
            read_at,
            timestamp: n.timestamp.as_millis() as u64,
            kind,
            update_type,
            title,
            author,
            event_kind,
        });
    }
    result.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    result.truncate(limit as usize);
    Ok(result)
}

#[tauri::command]
pub fn notification_count(rid: Option<String>) -> Result<NotificationCountData, String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let db = profile.notifications_mut().map_err(|e| e.to_string())?;
    let mut total: u64 = 0;
    let mut unread: u64 = 0;
    for notif in db.all().map_err(|e| e.to_string())? {
        let n = match notif {
            Ok(n) => n,
            Err(_) => continue,
        };
        if let Some(ref r) = rid {
            if n.repo.to_string() != *r {
                continue;
            }
        }
        total += 1;
        if matches!(n.status, NotificationStatus::Unread) {
            unread += 1;
        }
    }
    Ok(NotificationCountData { total, unread })
}

#[tauri::command]
pub fn mark_notifications_read(ids: Vec<u32>) -> Result<(), String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let mut db = profile.notifications_mut().map_err(|e| e.to_string())?;
    db.set_status(NotificationStatus::ReadAt(LocalTime::now()), &ids)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn clear_notifications(ids: Vec<u32>) -> Result<(), String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let mut db = profile.notifications_mut().map_err(|e| e.to_string())?;
    if ids.is_empty() {
        db.clear_all().map_err(|e| e.to_string())?;
    } else {
        db.clear(&ids).map_err(|e| e.to_string())?;
    }
    Ok(())
}
