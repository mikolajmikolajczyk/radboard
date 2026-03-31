import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { NotificationData, RawIssueData, RawPatchDetailData, RawCommentData } from '../../types/radboard';
import styles from './NotificationRow.module.css';

interface Props {
  notification: NotificationData;
  onMarkRead: (ids: number[]) => void;
  onClear: (ids: number[]) => void;
  onNavigate: (n: NotificationData) => void;
  showRepoName?: boolean;
}

export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function kindLabel(kind: NotificationData['kind']): { text: string; className: string } {
  switch (kind.type) {
    case 'issue':   return { text: 'Issue',  className: styles.kindIssue };
    case 'patch':   return { text: 'Patch',  className: styles.kindPatch };
    case 'branch':  return { text: 'Branch', className: styles.kindBranch };
    case 'tag':     return { text: 'Tag',    className: styles.kindTag };
    case 'unknown': return { text: 'Ref',    className: styles.kindUnknown };
  }
}

export function cobIdPrefix(kind: NotificationData['kind']): string | null {
  if (kind.type === 'issue' || kind.type === 'patch') return kind.id.slice(0, 7);
  return null;
}

export function eventKindLabel(eventKind: string | undefined, updateType: string): string {
  switch (eventKind) {
    case 'new_issue': return 'opened';
    case 'new_patch': return 'opened';
    case 'new_tag':   return 'tagged';
    case 'comment':   return 'commented';
    case 'revision':  return 'new revision';
    case 'updated':   return 'updated';
    default: return updateType;
  }
}

// Sentinel for "open a new top-level comment form" (not a reply to any specific comment)
const NEW_COMMENT = '__new__';

export default function NotificationRow({ notification: n, onMarkRead, onClear, onNavigate, showRepoName }: Props) {
  const [expanded, setExpanded]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [issueData, setIssueData]   = useState<RawIssueData | null>(null);
  const [patchData, setPatchData]   = useState<RawPatchDetailData | null>(null);
  // null = form closed; NEW_COMMENT = new top-level; commentId = reply to that comment
  const [replyToId, setReplyToId]     = useState<string | null>(null);
  const [replyBody, setReplyBody]     = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const canExpand = n.kind.type === 'issue' || n.kind.type === 'patch';

  async function handleToggleExpand() {
    if (!canExpand) { onNavigate(n); return; }
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (issueData || patchData) { if (n.status === 'unread') onMarkRead([n.id]); return; }
    setLoading(true);
    try {
      if (n.kind.type === 'issue') {
        const data = await invoke<RawIssueData | null>('get_issue', { rid: n.repo, issueId: n.kind.id });
        setIssueData(data);
      } else if (n.kind.type === 'patch') {
        const data = await invoke<RawPatchDetailData>('get_patch_detail', { rid: n.repo, patchId: n.kind.id, revisionId: '' });
        setPatchData(data);
      }
    } finally {
      setLoading(false);
      if (n.status === 'unread') onMarkRead([n.id]);
    }
  }

  function openReply(commentId: string) {
    setReplyToId(commentId);
    setReplyBody('');
  }

  function cancelReply() {
    setReplyToId(null);
    setReplyBody('');
  }

  async function submitIssueReply() {
    if (!replyBody.trim() || submitting || n.kind.type !== 'issue') return;
    setSubmitting(true);
    try {
      if (replyToId === NEW_COMMENT) {
        await invoke('add_comment', { rid: n.repo, issueId: n.kind.id, body: replyBody });
      } else {
        await invoke('reply_comment', { rid: n.repo, issueId: n.kind.id, commentId: replyToId, body: replyBody });
      }
      cancelReply();
      const data = await invoke<RawIssueData | null>('get_issue', { rid: n.repo, issueId: n.kind.id });
      setIssueData(data);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitPatchReply() {
    if (!replyBody.trim() || submitting || n.kind.type !== 'patch' || !patchData) return;
    setSubmitting(true);
    try {
      if (replyToId === NEW_COMMENT) {
        await invoke('add_patch_comment', { rid: n.repo, patchId: n.kind.id, revisionId: patchData.revisionId, body: replyBody });
      } else {
        await invoke('reply_patch_comment', { rid: n.repo, patchId: n.kind.id, revisionId: patchData.revisionId, commentId: replyToId, body: replyBody });
      }
      cancelReply();
      const data = await invoke<RawPatchDetailData>('get_patch_detail', { rid: n.repo, patchId: n.kind.id, revisionId: '' });
      setPatchData(data);
    } finally {
      setSubmitting(false);
    }
  }

  const submitReply = issueData ? submitIssueReply : submitPatchReply;

  function renderReplyForm() {
    return (
      <div className={styles.replyForm}>
        <textarea
          className={styles.replyTextarea}
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          placeholder="Write a comment…"
          rows={3}
          autoFocus
        />
        <div className={styles.replyActions}>
          <button className={styles.replySubmit} disabled={!replyBody.trim() || submitting} onClick={submitReply}>Send</button>
          <button className={styles.replyCancel} onClick={cancelReply}>Cancel</button>
        </div>
      </div>
    );
  }

  // Returns true if this comment or any descendant was created around the notification time.
  function threadContainsNew(c: RawCommentData): boolean {
    if (c.createdAt >= n.timestamp - 10_000) return true;
    return c.replies.some(threadContainsNew);
  }

  // Flatten the comment tree into a depth-annotated list so all blocks render
  // as siblings in the flex column — avoids compounding padding/overflow issues.
  function flattenComments(comments: RawCommentData[], depth = 0): { c: RawCommentData; depth: number }[] {
    const out: { c: RawCommentData; depth: number }[] = [];
    for (const c of comments) {
      out.push({ c, depth });
      out.push(...flattenComments(c.replies, depth + 1));
    }
    return out;
  }

  function renderComment(c: RawCommentData, isNew: boolean, depth: number) {
    return (
      <div
        key={c.id}
        className={`${styles.commentBlock} ${isNew ? styles.commentNew : ''} ${depth > 0 ? styles.commentIndented : ''}`}
        style={depth > 0 ? { marginLeft: `${depth * 18}px` } : undefined}
      >
        <div className={styles.commentHeader}>
          <span className={styles.commentAuthor}>{c.author}</span>
          <span className={styles.commentTime}>{relativeTime(c.createdAt)}</span>
          {replyToId !== c.id && (
            <button className={styles.commentReplyBtn} onClick={() => openReply(c.id)}>↩ reply</button>
          )}
        </div>
        <div className={styles.commentBody}>{c.body}</div>
        {replyToId === c.id && renderReplyForm()}
      </div>
    );
  }

  const { text: kindText, className: kindClassName } = kindLabel(n.kind);
  const prefix = cobIdPrefix(n.kind);
  const openLabel = n.kind.type === 'patch' ? 'Open patch' : 'Open issue';

  return (
    <div className={styles.notifRow}>
      {/* ── Header ── */}
      <div className={styles.header} onClick={handleToggleExpand}>
        <div className={n.status === 'unread' ? styles.unreadDot : styles.readDot} />
        <span className={`${styles.kindBadge} ${kindClassName}`}>{kindText}</span>
        <span className={styles.summary}>
          {n.title ? (
            <>
              <span className={styles.rowTitle}>{n.title}</span>
              <span className={styles.rowMeta}>
                {n.author && <span className={styles.rowAuthor}>{n.author}</span>}
                {n.author && <span className={styles.rowMetaSep}>·</span>}
                <span className={styles.updateType}>{eventKindLabel(n.eventKind, n.updateType)}</span>
              </span>
            </>
          ) : n.kind.type === 'branch' ? (
            <>
              <span className={styles.rowTitle}>{n.kind.name}</span>
              <span className={styles.rowMeta}>
                <span className={styles.updateType}>{n.updateType}</span>
              </span>
            </>
          ) : (
            <>
              {prefix && <span className={styles.cobId}>{prefix} </span>}
              <span className={styles.updateType}>{n.updateType}</span>
            </>
          )}
        </span>
        {showRepoName && <span className={styles.repoName}>{n.repoName}</span>}
        <span className={styles.time}>{relativeTime(n.timestamp)}</span>
        <div className={styles.rowActions}>
          {n.status === 'unread' && (
            <button
              className={styles.rowActionBtn}
              title="Mark read"
              onClick={(e) => { e.stopPropagation(); onMarkRead([n.id]); }}
            >✓</button>
          )}
          {canExpand && (
            <button
              className={styles.rowActionBtn}
              title={openLabel}
              onClick={(e) => { e.stopPropagation(); onNavigate(n); }}
            >↗</button>
          )}
          {n.kind.type === 'tag' && (
            <button
              className={styles.rowActionBtn}
              title="View in Files"
              onClick={(e) => { e.stopPropagation(); onNavigate(n); }}
            >↗</button>
          )}
          <button
            className={styles.rowActionBtn}
            title="Clear"
            onClick={(e) => { e.stopPropagation(); onClear([n.id]); }}
          >×</button>
        </div>
        {canExpand && (
          <span className={styles.expandChevron}>{expanded ? '▲' : '▼'}</span>
        )}
      </div>

      {/* ── Expanded ── */}
      {expanded && (
        <div className={styles.expandedSection}>
          {loading && <div className={styles.loadingHint}>Loading…</div>}

          {issueData && (
            <>
              <div className={`${styles.commentBlock} ${styles.descriptionBlock}`}>
                <div className={styles.commentHeader}>
                  <span className={styles.commentAuthor}>{issueData.author}</span>
                  <span className={styles.commentTime}>{relativeTime(issueData.createdAt)}</span>
                </div>
                <div className={styles.commentBody}>{issueData.description}</div>
              </div>
              {flattenComments(
                n.eventKind === 'comment'
                  ? issueData.comments.filter(threadContainsNew)
                  : issueData.comments
              ).map(({ c, depth }) =>
                renderComment(c, c.createdAt >= n.timestamp - 10_000, depth)
              )}
              {replyToId === NEW_COMMENT
                ? renderReplyForm()
                : <button className={styles.replyBtn} onClick={() => openReply(NEW_COMMENT)}>↩ Add comment</button>
              }
            </>
          )}

          {patchData && (
            <>
              {[...patchData.revisions].reverse().map((rev) => {
                const isNew = rev.createdAt >= n.timestamp - 10_000;
                return (
                  <div
                    key={rev.id}
                    className={`${styles.revisionBlock} ${isNew ? styles.revisionNew : ''}`}
                    onClick={() => onNavigate(n)}
                    title="Open patch"
                  >
                    <div className={styles.revisionMeta}>
                      <span className={styles.revisionId}>{rev.id.slice(0, 7)}</span>
                      <span className={styles.revisionArrow}>→</span>
                      <span className={styles.revisionCommits}>
                        <span className={styles.revisionLabel}>base</span>
                        <span className={styles.revisionHash}>{rev.base.slice(0, 7)}</span>
                        <span className={styles.revisionLabel}>head</span>
                        <span className={styles.revisionHash}>{rev.head.slice(0, 7)}</span>
                      </span>
                      <span className={styles.revisionAuthor}>{rev.author}</span>
                      <span className={styles.revisionTime}>{relativeTime(rev.createdAt)}</span>
                    </div>
                    {rev.description && <div className={styles.revisionDesc}>{rev.description}</div>}
                  </div>
                );
              })}
              {flattenComments(patchData.comments).map(({ c, depth }) =>
                renderComment(c, c.createdAt >= n.timestamp - 10_000, depth)
              )}
              {replyToId === NEW_COMMENT
                ? renderReplyForm()
                : <button className={styles.replyBtn} onClick={() => openReply(NEW_COMMENT)}>↩ Add comment</button>
              }
            </>
          )}
        </div>
      )}
    </div>
  );
}
