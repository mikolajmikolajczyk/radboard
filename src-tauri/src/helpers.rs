use radicle::cob::thread::CommentId;
use radicle::node::{AliasStore as _, NodeId};
use radicle::prelude::Did;
use radicle::profile::Profile;

use crate::types::{CodeLocationData, CommentData, ReactionData};

pub(crate) fn resolve_author(profile: &Profile, pk: NodeId) -> String {
    profile
        .alias(&pk)
        .map(|a| a.to_string())
        .unwrap_or_else(|| {
            let did = Did::from(pk).to_string(); // did:key:z6Mk...
            // Return a short key prefix like "z6Mksb…" instead of the full DID
            did.strip_prefix("did:key:")
                .map(|key| {
                    let end = key.char_indices().nth(8).map(|(i, _)| i).unwrap_or(key.len());
                    format!("{}…", &key[..end])
                })
                .unwrap_or(did)
        })
}

pub(crate) fn reactions_from(
    profile: &Profile,
    raw: std::collections::BTreeMap<&radicle::cob::common::Reaction, Vec<&radicle::cob::ActorId>>,
) -> Vec<ReactionData> {
    raw.into_iter()
        .map(|(reaction, authors)| ReactionData {
            emoji: reaction.emoji().to_string(),
            authors: authors
                .into_iter()
                .map(|pk| resolve_author(profile, *pk))
                .collect(),
        })
        .collect()
}

pub(crate) fn build_comments(
    profile: &Profile,
    issue: &radicle::cob::issue::Issue,
    parent: &CommentId,
) -> Vec<CommentData> {
    issue
        .replies_to(parent)
        .map(|(id, comment)| CommentData {
            id: id.to_string(),
            author: resolve_author(profile, comment.author()),
            author_did: Did::from(comment.author()).to_string(),
            body: comment.body().to_owned(),
            created_at: comment.timestamp().as_millis() as u64,
            reactions: reactions_from(profile, comment.reactions()),
            replies: build_comments(profile, issue, id),
            location: None,
        })
        .collect()
}

pub(crate) fn pick_revision<'a>(
    patch: &'a radicle::cob::patch::Patch,
    revision_id: &str,
) -> Result<(radicle::cob::patch::RevisionId, &'a radicle::cob::patch::Revision), String> {
    if revision_id.is_empty() {
        patch.revisions().last().ok_or_else(|| "patch has no revisions".to_string())
    } else {
        patch.revisions()
            .find(|(id, _)| id.to_string() == revision_id)
            .ok_or_else(|| format!("revision {revision_id} not found"))
    }
}

pub(crate) fn build_patch_comments(
    profile: &Profile,
    thread: &radicle::cob::thread::Thread<radicle::cob::thread::Comment<radicle::cob::CodeLocation>>,
    parent: Option<&CommentId>,
) -> Vec<CommentData> {
    thread
        .comments()
        .filter(|(_, c)| c.reply_to().as_ref() == parent)
        .map(|(id, comment)| {
            let id_copy = *id;
            let location = comment.location().map(|loc| CodeLocationData {
                path: loc.path.display().to_string(),
                new_line: loc.new.as_ref().map(|r| match r {
                    radicle::cob::CodeRange::Lines { range } => range.start as u32,
                    radicle::cob::CodeRange::Chars { line, .. } => *line as u32,
                }),
                old_line: loc.old.as_ref().map(|r| match r {
                    radicle::cob::CodeRange::Lines { range } => range.start as u32,
                    radicle::cob::CodeRange::Chars { line, .. } => *line as u32,
                }),
                commit: loc.commit.to_string(),
            });
            CommentData {
                id: id.to_string(),
                author: resolve_author(profile, comment.author()),
                author_did: Did::from(comment.author()).to_string(),
                body: comment.body().to_owned(),
                created_at: comment.timestamp().as_millis() as u64,
                reactions: reactions_from(profile, comment.reactions()),
                replies: build_patch_comments(profile, thread, Some(&id_copy)),
                location,
            }
        })
        .collect()
}
