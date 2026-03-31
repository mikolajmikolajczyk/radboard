import { useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { IssueComment } from '../../types/kanban';
import { Button, Textarea } from '../../ui';
import { useRepo } from '../../contexts/RepoContext';
import styles from './PatchComment.module.css';

interface PatchCommentProps {
  comment: IssueComment;
  patchId: string;
  revisionId: string;
  depth?: number;
  onRefresh: () => void;
}

export function PatchComment({ comment, patchId, revisionId, depth = 0, onRefresh }: PatchCommentProps) {
  const { rid } = useRepo();
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function openReply() {
    setReplying(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  async function submitReply() {
    if (!replyBody.trim()) return;
    setSubmitting(true);
    try {
      await invoke('reply_patch_comment', {
        rid,
        patchId,
        revisionId,
        commentId: comment.id,
        body: replyBody.trim(),
      });
      setReplyBody('');
      setReplying(false);
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`${styles.patchComment} ${depth > 0 ? styles.patchReply : ''}`}>
      <div className={styles.patchCommentMeta}>
        <span className={styles.patchCommentAuthor}>@{comment.author}</span>
        <span className={styles.patchCommentDate}>{comment.createdAt}</span>
      </div>
      <p className={styles.patchCommentBody}>{comment.body}</p>
      <div className={styles.patchCommentActions}>
        {comment.reactions.map((r) => (
          <span key={r.emoji} className={styles.patchReaction} title={r.authors.join(', ')}>
            {r.emoji} {r.authors.length}
          </span>
        ))}
        <button className={styles.patchReplyBtn} onClick={openReply}>reply</button>
      </div>
      {replying && (
        <div className={styles.patchReplyForm}>
          <Textarea
            ref={textareaRef}
            className={styles.patchCommentInput}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Write a reply…"
            rows={2}
          />
          <div className={styles.patchReplyActions}>
            <Button
              size="sm"
              variant="primary"
              onClick={submitReply}
              disabled={submitting || !replyBody.trim()}
            >
              {submitting ? 'Posting…' : 'Reply'}
            </Button>
            <Button size="sm" onClick={() => setReplying(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {comment.replies.map((reply) => (
        <PatchComment
          key={reply.id}
          comment={reply}
          patchId={patchId}
          revisionId={revisionId}
          depth={depth + 1}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  );
}
