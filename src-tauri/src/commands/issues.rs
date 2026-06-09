use std::collections::HashSet;

use radicle::cob::common::Reaction;
use radicle::cob::issue::{CloseReason, Issues, State};
use radicle::cob::store::access::ReadOnly;
use radicle::cob::thread::CommentId;
use radicle::identity::IdError;
use radicle::node::{Alias, AliasStore as _};
use radicle::prelude::Did;
use radicle::profile::Profile;
use radicle::storage::{ReadRepository as _, ReadStorage as _, WriteStorage as _};

use crate::helpers::{announce_refs, build_comments, reactions_from, resolve_author};
use crate::types::{AssigneeRef, IssueData};

fn collect_assignees(profile: &Profile, issue: &radicle::cob::issue::Issue) -> Vec<AssigneeRef> {
    issue.assignees()
        .map(|did| {
            let pk = *did.as_key();
            AssigneeRef {
                did: did.to_string(),
                alias: resolve_author(profile, pk),
            }
        })
        .collect()
}

#[tauri::command]
pub async fn list_issues(rid: String) -> Result<Vec<IssueData>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let profile = Profile::load().map_err(|e| e.to_string())?;
        let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
        let repo = profile.storage.repository(rid).map_err(|e| e.to_string())?;
        let issues = Issues::open(&repo, ReadOnly).map_err(|e| e.to_string())?;

        let mut all: Vec<_> = issues
            .all()
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        all.sort_by(|a, b| b.1.timestamp().as_millis().cmp(&a.1.timestamp().as_millis()));

        let mut result = Vec::new();
        for (id, issue) in all {
            let (root_id, root) = issue.root();
            let state = match issue.state() {
                State::Open => "open",
                State::Closed { reason: CloseReason::Solved } => "solved",
                State::Closed { .. } => "closed",
            };
            let comment_count = issue.replies_to(root_id).count() as u64;
            result.push(IssueData {
                id: id.to_string(),
                root_id: root_id.to_string(),
                author: resolve_author(&profile, *issue.author().public_key()),
                author_did: Did::from(*issue.author().public_key()).to_string(),
                title: issue.title().to_owned(),
                description: root.body().to_owned(),
                state: state.to_owned(),
                created_at: issue.timestamp().as_millis() as u64,
                labels: issue.labels().map(|l| l.name().to_owned()).collect(),
                assignees: collect_assignees(&profile, &issue),
                reactions: reactions_from(&profile, root.reactions()),
                comments: vec![],
                comment_count,
            });
        }
        Ok(result)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn get_issue(rid: String, issue_id: String) -> Result<Option<IssueData>, String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository(rid).map_err(|e| e.to_string())?;
    let issues = Issues::open(&repo, ReadOnly).map_err(|e| e.to_string())?;
    let oid = issue_id.parse::<radicle::cob::ObjectId>().map_err(|e| e.to_string())?;
    let issue = match issues.get(&oid).map_err(|e| e.to_string())? {
        Some(i) => i,
        None => return Ok(None),
    };
    let (root_id, root) = issue.root();
    let state = match issue.state() {
        State::Open => "open",
        State::Closed { reason: CloseReason::Solved } => "solved",
        State::Closed { .. } => "closed",
    };
    Ok(Some(IssueData {
        id: oid.to_string(),
        root_id: root_id.to_string(),
        author: resolve_author(&profile, *issue.author().public_key()),
        author_did: Did::from(*issue.author().public_key()).to_string(),
        title: issue.title().to_owned(),
        description: root.body().to_owned(),
        state: state.to_owned(),
        created_at: issue.timestamp().as_millis() as u64,
        labels: issue.labels().map(|l| l.name().to_owned()).collect(),
        assignees: collect_assignees(&profile, &issue),
        reactions: reactions_from(&profile, root.reactions()),
        comments: build_comments(&profile, &issue, root_id),
        comment_count: 0,
    }))
}

#[tauri::command]
pub fn create_issue(
    rid: String,
    title: String,
    description: String,
    labels: Vec<String>,
) -> Result<String, String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository_mut(rid).map_err(|e| e.to_string())?;
    let signer = profile.signer().map_err(|e| e.to_string())?;
    let mut issues = profile.issues_mut(&repo, &signer).map_err(|e| e.to_string())?;
    let title = radicle::cob::Title::new(&title).map_err(|e| e.to_string())?;
    let parsed_labels: Vec<radicle::cob::Label> = labels
        .iter()
        .map(|l| l.parse::<radicle::cob::Label>().map_err(|e| e.to_string()))
        .collect::<Result<_, _>>()?;
    let issue = issues
        .create(title, description, &parsed_labels, &[], [])
        .map_err(|e| e.to_string())?;
    announce_refs(&profile, rid);
    Ok(issue.id().to_string())
}

#[tauri::command]
pub fn edit_issue(rid: String, issue_id: String, title: String, description: String) -> Result<(), String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository_mut(rid).map_err(|e| e.to_string())?;
    let signer = profile.signer().map_err(|e| e.to_string())?;
    let issue_id = issue_id
        .parse::<radicle::cob::ObjectId>()
        .map_err(|e| e.to_string())?;
    let title = radicle::cob::Title::new(&title).map_err(|e| e.to_string())?;
    let mut issues = profile.issues_mut(&repo, &signer).map_err(|e| e.to_string())?;
    let mut issue = issues.get_mut(&issue_id).map_err(|e| e.to_string())?;
    issue.edit(title).map_err(|e| e.to_string())?;
    issue.edit_description(description, []).map_err(|e| e.to_string())?;
    announce_refs(&profile, rid);
    Ok(())
}

#[tauri::command]
pub fn search_users(rid: String, query: String) -> Result<Vec<AssigneeRef>, String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;

    let mut result: Vec<AssigneeRef> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    let q = query.trim();
    let q_lower = q.to_lowercase();

    let push = |result: &mut Vec<AssigneeRef>, seen: &mut HashSet<String>, did: String, alias: String| {
        if seen.insert(did.clone()) {
            // Only include if query is empty or matches the alias/did
            if q_lower.is_empty()
                || alias.to_lowercase().contains(&q_lower)
                || did.to_lowercase().contains(&q_lower)
            {
                result.push(AssigneeRef { did, alias });
            }
        }
    };

    // Always offer "self" first.
    let me_pk = profile.public_key;
    push(
        &mut result,
        &mut seen,
        Did::from(me_pk).to_string(),
        resolve_author(&profile, me_pk),
    );

    // Then the delegates of the active repo.
    if let Ok(repo) = profile.storage.repository(rid) {
        if let Ok(delegates) = repo.delegates() {
            for did in delegates.iter() {
                let pk = *did.as_key();
                push(
                    &mut result,
                    &mut seen,
                    did.to_string(),
                    resolve_author(&profile, pk),
                );
            }
        }
    }

    // Then a substring search in the alias store (peers from policy + node DB).
    if !q.is_empty() {
        if let Ok(alias) = q.parse::<Alias>() {
            for (alias, nodes) in profile.aliases().reverse_lookup(&alias) {
                for node in nodes {
                    let did = Did::from(node).to_string();
                    push(&mut result, &mut seen, did, alias.to_string());
                }
            }
        }
    }

    result.truncate(20);
    Ok(result)
}

#[tauri::command]
pub fn assign_issue(rid: String, issue_id: String, assignees: Vec<String>) -> Result<(), String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository_mut(rid).map_err(|e| e.to_string())?;
    let signer = profile.signer().map_err(|e| e.to_string())?;
    let issue_id = issue_id
        .parse::<radicle::cob::ObjectId>()
        .map_err(|e| e.to_string())?;
    let parsed: Vec<Did> = assignees
        .iter()
        .map(|s| s.parse::<Did>().map_err(|e| e.to_string()))
        .collect::<Result<_, _>>()?;
    let mut issues = profile.issues_mut(&repo, &signer).map_err(|e| e.to_string())?;
    let mut issue = issues.get_mut(&issue_id).map_err(|e| e.to_string())?;
    issue.assign(parsed).map_err(|e| e.to_string())?;
    announce_refs(&profile, rid);
    Ok(())
}

#[tauri::command]
pub fn label_issue(rid: String, issue_id: String, labels: Vec<String>) -> Result<(), String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository_mut(rid).map_err(|e| e.to_string())?;
    let signer = profile.signer().map_err(|e| e.to_string())?;
    let issue_id = issue_id
        .parse::<radicle::cob::ObjectId>()
        .map_err(|e| e.to_string())?;
    let parsed_labels: Vec<radicle::cob::Label> = labels
        .iter()
        .map(|l| l.parse::<radicle::cob::Label>().map_err(|e| e.to_string()))
        .collect::<Result<_, _>>()?;
    let mut issues = profile.issues_mut(&repo, &signer).map_err(|e| e.to_string())?;
    let mut issue = issues.get_mut(&issue_id).map_err(|e| e.to_string())?;
    issue.label(parsed_labels).map_err(|e| e.to_string())?;
    announce_refs(&profile, rid);
    Ok(())
}

#[tauri::command]
pub fn set_issue_state(rid: String, issue_id: String, state: String) -> Result<(), String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository_mut(rid).map_err(|e| e.to_string())?;
    let signer = profile.signer().map_err(|e| e.to_string())?;
    let issue_id = issue_id.parse::<radicle::cob::ObjectId>().map_err(|e| e.to_string())?;
    let new_state = match state.as_str() {
        "closed" => State::Closed { reason: CloseReason::Other },
        "solved" => State::Closed { reason: CloseReason::Solved },
        _ => State::Open,
    };
    let mut issues = profile.issues_mut(&repo, &signer).map_err(|e| e.to_string())?;
    let mut issue = issues.get_mut(&issue_id).map_err(|e| e.to_string())?;
    issue.lifecycle(new_state).map_err(|e| e.to_string())?;
    announce_refs(&profile, rid);
    Ok(())
}

#[tauri::command]
pub fn add_comment(rid: String, issue_id: String, body: String) -> Result<(), String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository_mut(rid).map_err(|e| e.to_string())?;
    let signer = profile.signer().map_err(|e| e.to_string())?;
    let issue_id = issue_id
        .parse::<radicle::cob::ObjectId>()
        .map_err(|e| e.to_string())?;
    let mut issues = profile.issues_mut(&repo, &signer).map_err(|e| e.to_string())?;
    let mut issue = issues.get_mut(&issue_id).map_err(|e| e.to_string())?;
    let (root_id, _) = issue.root();
    let root_id = *root_id;
    issue.comment(body, root_id, vec![]).map_err(|e| e.to_string())?;
    announce_refs(&profile, rid);
    Ok(())
}

#[tauri::command]
pub fn reply_comment(
    rid: String,
    issue_id: String,
    comment_id: String,
    body: String,
) -> Result<(), String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository_mut(rid).map_err(|e| e.to_string())?;
    let signer = profile.signer().map_err(|e| e.to_string())?;
    let issue_id = issue_id
        .parse::<radicle::cob::ObjectId>()
        .map_err(|e| e.to_string())?;
    let comment_id = comment_id
        .parse::<CommentId>()
        .map_err(|e| e.to_string())?;
    let mut issues = profile.issues_mut(&repo, &signer).map_err(|e| e.to_string())?;
    let mut issue = issues.get_mut(&issue_id).map_err(|e| e.to_string())?;
    issue
        .comment(body, comment_id, vec![])
        .map_err(|e| e.to_string())?;
    announce_refs(&profile, rid);
    Ok(())
}

#[tauri::command]
pub fn react_comment(
    rid: String,
    issue_id: String,
    comment_id: String,
    emoji: String,
    active: bool,
) -> Result<(), String> {
    let profile = Profile::load().map_err(|e| e.to_string())?;
    let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
    let repo = profile.storage.repository_mut(rid).map_err(|e| e.to_string())?;
    let signer = profile.signer().map_err(|e| e.to_string())?;
    let issue_id = issue_id
        .parse::<radicle::cob::ObjectId>()
        .map_err(|e| e.to_string())?;
    let comment_id = comment_id
        .parse::<CommentId>()
        .map_err(|e| e.to_string())?;
    let first_char = emoji.chars().next().ok_or("empty emoji")?;
    let reaction = Reaction::new(first_char).map_err(|e| e.to_string())?;
    let mut issues = profile.issues_mut(&repo, &signer).map_err(|e| e.to_string())?;
    let mut issue = issues.get_mut(&issue_id).map_err(|e| e.to_string())?;
    issue
        .react(comment_id, reaction, active)
        .map_err(|e| e.to_string())?;
    announce_refs(&profile, rid);
    Ok(())
}
