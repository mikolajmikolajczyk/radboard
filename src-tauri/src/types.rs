use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LocalConfig {
    pub rids: Vec<String>,
    #[serde(default)]
    pub column_order: std::collections::HashMap<String, Vec<String>>,
    #[serde(default)]
    pub column_colors: std::collections::HashMap<String, std::collections::HashMap<String, String>>,
    #[serde(default)]
    pub visible_columns: Option<u32>,
    #[serde(default)]
    pub explorer_url: Option<String>,
    #[serde(default)]
    pub seed_node: Option<String>,
    #[serde(default)]
    pub banned_users: Vec<BannedUserEntry>,
    #[serde(default)]
    pub local_repo_paths: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub preferred_editor: Option<String>,
    #[serde(default)]
    pub inbox_page_size: Option<u32>,
    #[serde(default)]
    pub last_active_rid: Option<String>,
    #[serde(default)]
    pub last_active_view: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BannedUserEntry {
    pub did: String,
    pub alias: String,
    pub scope: String, // "all" | "issues" | "comments"
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityInfo {
    pub did: String,
    pub alias: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub rid: String,
    pub name: String,
    pub description: String,
    pub default_branch: String,
    pub delegate_dids: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReactionData {
    pub emoji: String,
    pub authors: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeLocationData {
    pub path: String,
    pub new_line: Option<u32>,
    pub old_line: Option<u32>,
    pub commit: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentData {
    pub id: String,
    pub author: String,
    pub author_did: String,
    pub body: String,
    pub created_at: u64,
    pub reactions: Vec<ReactionData>,
    pub replies: Vec<CommentData>,
    pub location: Option<CodeLocationData>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchData {
    pub id: String,
    pub title: String,
    pub description: String,
    pub author: String,
    pub author_did: String,
    pub state: String,
    pub created_at: u64,
    pub head: String, // latest revision head commit (40-char hex)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PagedPatches {
    pub items: Vec<PatchData>,
    pub total: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchReviewData {
    pub reviewer: String,
    pub reviewer_did: String,
    pub verdict: Option<String>, // "accept" | "reject" | None
    pub summary: String,
    pub created_at: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchRevisionRef {
    pub id: String,
    pub description: String,
    pub created_at: u64,
    pub head: String,
    pub base: String,
    pub author: String,
    pub author_did: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchDetailData {
    pub id: String,
    pub title: String,
    pub description: String,
    pub author: String,
    pub author_did: String,
    pub state: String,
    pub created_at: u64,
    pub revision_id: String,
    pub revisions: Vec<PatchRevisionRef>,
    pub comments: Vec<CommentData>,
    pub reviews: Vec<PatchReviewData>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueData {
    pub id: String,
    pub root_id: String,
    pub author: String,
    pub author_did: String,
    pub title: String,
    pub description: String,
    pub state: String,
    pub created_at: u64,
    pub labels: Vec<String>,
    pub reactions: Vec<ReactionData>,
    pub comments: Vec<CommentData>,
    pub comment_count: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationData {
    pub id: u32,
    pub repo: String,
    pub repo_name: String,
    pub status: String,
    pub read_at: Option<u64>,
    pub timestamp: u64,
    pub kind: NotificationKindData,
    pub update_type: String,
    /// Title of the issue or patch, if available
    pub title: Option<String>,
    /// Display name of whoever triggered the event
    pub author: Option<String>,
    /// "new_issue" | "new_patch" | "comment" | "revision" | "updated"
    pub event_kind: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum NotificationKindData {
    #[serde(rename = "issue")]
    Issue { id: String },
    #[serde(rename = "patch")]
    Patch { id: String },
    #[serde(rename = "branch")]
    Branch { name: String },
    #[serde(rename = "tag")]
    Tag { name: String, author: String },
    #[serde(rename = "unknown")]
    Unknown { ref_name: String },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationCountData {
    pub total: u64,
    pub unread: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntryData {
    pub name: String,
    pub kind: String, // "tree" | "blob"
    pub oid: String,
    pub size: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlobContentData {
    pub content: String,
    pub size: u64,
    pub is_binary: bool,
    pub is_truncated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileLogEntry {
    pub oid: String,
    pub author: String,
    pub timestamp: u64, // epoch seconds
    pub summary: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitEntry {
    pub oid: String,
    pub summary: String,
    pub author: String,
    pub author_timestamp: u64, // epoch seconds
    pub committer: String,
    pub committer_timestamp: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlameHunkData {
    pub commit_oid: String,
    pub author: String,
    pub timestamp: u64, // epoch seconds
    pub summary: String,
    pub start_line: u32,
    pub line_count: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
    pub head: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStatus {
    pub path: String,
    pub status: String, // raw 2-char porcelain code, e.g. "M ", " M", "??", "A "
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchCommitEntry {
    pub oid: String,
    pub short_oid: String,
    pub summary: String,
    pub timestamp: u64,
}
