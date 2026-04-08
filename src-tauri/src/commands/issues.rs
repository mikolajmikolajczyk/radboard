use radicle::cob::common::Reaction;
use radicle::cob::issue::{CloseReason, Issues, State};
use radicle::cob::thread::CommentId;
use radicle::identity::IdError;
use radicle::prelude::Did;
use radicle::profile::Profile;
use radicle::storage::{ReadStorage as _, WriteStorage as _};

use crate::helpers::{announce_refs, build_comments, reactions_from, resolve_author};
use crate::types::IssueData;

#[tauri::command]
pub async fn list_issues(rid: String) -> Result<Vec<IssueData>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let profile = Profile::load().map_err(|e| e.to_string())?;
        let rid: radicle::prelude::RepoId = rid.parse().map_err(|e: IdError| e.to_string())?;
        let repo = profile.storage.repository(rid).map_err(|e| e.to_string())?;
        let issues = Issues::open(&repo).map_err(|e| e.to_string())?;

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
    let issues = Issues::open(&repo).map_err(|e| e.to_string())?;
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
    let mut issues = profile.issues_mut(&repo).map_err(|e| e.to_string())?;
    let title = radicle::cob::Title::new(&title).map_err(|e| e.to_string())?;
    let parsed_labels: Vec<radicle::cob::Label> = labels
        .iter()
        .map(|l| l.parse::<radicle::cob::Label>().map_err(|e| e.to_string()))
        .collect::<Result<_, _>>()?;
    let issue = issues
        .create(title, description, &parsed_labels, &[], [], &signer)
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
    let mut issues = profile.issues_mut(&repo).map_err(|e| e.to_string())?;
    let mut issue = issues.get_mut(&issue_id).map_err(|e| e.to_string())?;
    issue.edit(title, &signer).map_err(|e| e.to_string())?;
    issue.edit_description(description, [], &signer).map_err(|e| e.to_string())?;
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
    let mut issues = profile.issues_mut(&repo).map_err(|e| e.to_string())?;
    let mut issue = issues.get_mut(&issue_id).map_err(|e| e.to_string())?;
    issue.label(parsed_labels, &signer).map_err(|e| e.to_string())?;
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
    let mut issues = profile.issues_mut(&repo).map_err(|e| e.to_string())?;
    let mut issue = issues.get_mut(&issue_id).map_err(|e| e.to_string())?;
    issue.lifecycle(new_state, &signer).map_err(|e| e.to_string())?;
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
    let mut issues = profile.issues_mut(&repo).map_err(|e| e.to_string())?;
    let mut issue = issues.get_mut(&issue_id).map_err(|e| e.to_string())?;
    let (root_id, _) = issue.root();
    let root_id = *root_id;
    issue.comment(body, root_id, vec![], &signer).map_err(|e| e.to_string())?;
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
    let mut issues = profile.issues_mut(&repo).map_err(|e| e.to_string())?;
    let mut issue = issues.get_mut(&issue_id).map_err(|e| e.to_string())?;
    issue
        .comment(body, comment_id, vec![], &signer)
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
    let mut issues = profile.issues_mut(&repo).map_err(|e| e.to_string())?;
    let mut issue = issues.get_mut(&issue_id).map_err(|e| e.to_string())?;
    issue
        .react(comment_id, reaction, active, &signer)
        .map_err(|e| e.to_string())?;
    announce_refs(&profile, rid);
    Ok(())
}
