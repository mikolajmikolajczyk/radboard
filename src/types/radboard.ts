export interface RadicleIdentity {
  did: string;
  alias?: string;
}

export interface RepoInfo {
  rid: string;
  name: string;
  description?: string;
  defaultBranch: string;
  delegateDids: string[];
}

// Raw issue data as returned by the list_issues Tauri command
export interface AssigneeRef {
  did: string;
  alias: string;
}

export interface RawIssueData {
  id: string;
  rootId: string;
  author: string;
  authorDid: string;
  title: string;
  description: string;
  state: 'open' | 'closed' | 'solved';
  createdAt: number; // millis
  labels: string[];
  assignees: AssigneeRef[];
  reactions: { emoji: string; authors: string[] }[];
  comments: RawCommentData[];
  commentCount: number;
}

export interface RawPatchData {
  id: string;
  title: string;
  description: string;
  author: string;
  authorDid: string;
  state: 'open' | 'draft' | 'merged' | 'archived';
  createdAt: number;
  head: string;
}

export interface RawPatchReviewData {
  reviewer: string;
  reviewerDid: string;
  verdict: 'accept' | 'reject' | null;
  summary: string;
  createdAt: number;
}

export interface RawPatchRevisionRef {
  id: string;
  description: string;
  createdAt: number;
  head: string;
  base: string;
  author: string;
  authorDid: string;
}

export interface RawPatchDetailData {
  id: string;
  title: string;
  description: string;
  author: string;
  authorDid: string;
  state: 'open' | 'draft' | 'merged' | 'archived';
  createdAt: number;
  revisionId: string;
  revisions: RawPatchRevisionRef[];
  comments: RawCommentData[];
  reviews: RawPatchReviewData[];
}

export interface BannedEntry {
  did: string;
  alias: string;
  scope: 'all' | 'issues' | 'comments';
}

export interface RawCommentData {
  id: string;
  author: string;
  authorDid: string;
  body: string;
  createdAt: number; // millis
  reactions: { emoji: string; authors: string[] }[];
  replies: RawCommentData[];
  location?: {
    path: string;
    newLine?: number; // 1-based
    oldLine?: number; // 1-based
    commit: string;
  };
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
}

export interface FileStatus {
  path: string;
  status: string; // 2-char porcelain code, e.g. "M ", " M", "??"
}

export type NotificationKindData =
  | { type: 'issue'; id: string }
  | { type: 'patch'; id: string }
  | { type: 'branch'; name: string }
  | { type: 'tag'; name: string; author: string }
  | { type: 'unknown'; refName: string };

export interface NotificationData {
  id: number;
  repo: string;
  repoName: string;
  status: 'unread' | 'read';
  readAt: number | null;
  timestamp: number;
  kind: NotificationKindData;
  updateType: 'updated' | 'created' | 'deleted' | 'skipped';
  /** Title of the related issue or patch */
  title?: string;
  /** Display name of whoever triggered the event */
  author?: string;
  /** "new_issue" | "new_patch" | "comment" | "revision" | "updated" */
  eventKind?: string;
}

export interface NotificationCountData {
  total: number;
  unread: number;
}

export interface TreeEntryData {
  name: string;
  kind: 'tree' | 'blob';
  oid: string;
  size: number | null;
}

export interface BlobContentData {
  content: string;
  size: number;
  isBinary: boolean;
  isTruncated: boolean;
}

export interface PatchCommitEntry {
  oid: string;
  shortOid: string;
  summary: string;
  timestamp: number; // epoch seconds
}

export interface CommitEntry {
  oid: string;
  summary: string;
  author: string;
  authorTimestamp: number; // epoch seconds
  committer: string;
  committerTimestamp: number;
}

export interface FileLogEntry {
  oid: string;
  author: string;
  timestamp: number; // epoch seconds
  summary: string;
}

export interface BlameHunkData {
  commitOid: string;
  author: string;
  timestamp: number; // epoch seconds
  summary: string;
  startLine: number;
  lineCount: number;
}

export interface AppSetup {
  rids: string[];
  /** rid → ordered list of dynamic column ids (excludes open/closed) */
  columnOrder?: Record<string, string[]>;
  /** rid → colId → hex color */
  columnColors?: Record<string, Record<string, string>>;
  /** how many columns stretch to fill the window; extras scroll horizontally */
  visibleColumns?: number;
  /** base URL of the Radicle Explorer instance, e.g. https://app.radicle.xyz */
  explorerUrl?: string;
  /** seed node hostname used in Explorer URLs, e.g. seed.radicle.xyz */
  seedNode?: string;
  bannedUsers?: BannedEntry[];
  /** rid → absolute path to local git checkout */
  localRepoPaths?: Record<string, string>;
  /** CLI command to open preferred editor, e.g. "code", "zed", "nvim" */
  preferredEditor?: string;
  /** number of most-recent notifications to load per repo; default 50 */
  inboxPageSize?: number;
  /** last active repo RID — restored on startup */
  lastActiveRid?: string;
  /** last active view tab — restored on startup */
  lastActiveView?: string;
  /** label prefix used to identify milestone labels, default "milestone:" */
  milestonePrefix?: string;
}
