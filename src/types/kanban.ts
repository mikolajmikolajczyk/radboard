export type ColumnId = string;

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

export interface Issue {
  id: string;
  author: string;
  authorDid: string;
  title: string;
  labels: IssueLabel[];
  indicator?: IssueIndicator;
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

export type IssueStatus = 'open' | 'in-progress' | 'closed';

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
