export type ColumnId = string;

export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

export const PRIORITY_LEVELS: PriorityLevel[] = ['critical', 'high', 'medium', 'low'];

export interface IssueLabel {
  text: string;
  variant: 'refactor' | 'dedup' | 'inconsistency' | string;
}

export interface IssueIndicator {
  upvotes?: number;
  downvotes?: number;
  comments?: number;
  patches?: number;
}

export interface PatchRef {
  id: string;
  title: string;
  author: string;
  authorDid: string;
  state: 'open' | 'draft' | 'merged' | 'archived';
  head: string;
}

export interface BlockedRef {
  /** Raw value after `blocked:` — 7-char hex id or free-text reason. */
  raw: string;
  /** Resolved full issue id if `raw` matches a loaded issue's prefix. */
  linkedIssueId?: string;
}

export interface Issue {
  id: string;
  author: string;
  authorDid: string;
  title: string;
  labels: IssueLabel[];
  milestones?: string[];
  assignees?: import('./radboard').AssigneeRef[];
  blockedBy?: BlockedRef[];
  /** Full ids of loaded issues that have a `blocked:<prefix>` label pointing at this issue. */
  blockedIssueIds?: string[];
  indicator?: IssueIndicator;
  solved?: boolean;
  priority?: PriorityLevel;
  /** True if this issue has the `epic` label — render as parent header. */
  isEpic?: boolean;
  /** Raw value from `parent:<value>` label — 7-char hex prefix. */
  parentRaw?: string;
  /** Resolved full id of the parent epic, if loaded in the current repo. */
  parentId?: string;
  /** Full ids of loaded issues whose `parent:*` label resolves to this issue. */
  epicChildIds?: string[];
}

export interface KanbanColumnData {
  id: ColumnId;
  title: string;
  issues: Issue[];
  isStatic?: boolean;
}

export interface BoardTab {
  id: string;
  name: string;
}

export type IssueStatus = 'open' | 'in-progress' | 'closed' | 'solved';

export interface Reaction {
  emoji: string;
  authors: string[]; // DIDs
}

export interface IssueComment {
  id: string;
  author: string;
  authorDid: string;
  body: string;
  createdAt: string;
  reactions: Reaction[];
  replies: IssueComment[];
}

export interface PatchReview {
  reviewer: string;
  reviewerDid: string;
  verdict: 'accept' | 'reject' | null;
  summary: string;
  createdAt: string;
}

export interface IssueDetail extends Issue {
  rid: string;
  rootId: string;
  status: IssueStatus;
  description: string;
  createdAt: string;
  closedAt?: string;
  reactions: Reaction[];
  comments: IssueComment[] | null;
  commentCount: number;
  patches?: PatchRef[];
}
