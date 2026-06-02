import { useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Avatar, Button } from '../../ui';
import { MarkdownEditor } from './MarkdownEditor';
import { ReactionBar } from './ReactionBar';
import { EmojiPicker } from './EmojiPicker';
import type { IssueComment } from '../../types/kanban';
import { useRepo } from '../../contexts/RepoContext';
import { useActions } from '../../contexts/ActionsContext';
import styles from './CommentThread.module.css';

interface CommentThreadProps {
  comment: IssueComment;
  depth?: number;
  issueId: string;
  onRefresh: () => void;
}

export function CommentThread({
  comment,
  depth = 0,
  issueId,
  onRefresh,
}: CommentThreadProps) {
  const { rid, bannedUsers, myDid, delegateDids } = useRepo();
  const { onBanUser } = useActions();
  const bannedCommentDids = new Set(bannedUsers.filter((b) => b.scope === 'all' || b.scope === 'comments').map((b) => b.did));
  function canBanUser(did: string) {
    return myDid !== null && did !== myDid && !delegateDids.includes(did) && !bannedUsers.some((b) => b.did === did);
  }

  const isBanned = bannedCommentDids.has(comment.authorDid);
  const [expanded, setExpanded] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function openReply() {
    setReplying(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  async function submitReply() {
    if (!replyBody.trim()) return;
    setSubmitting(true);
    try {
      await invoke('reply_comment', {
        rid,
        issueId,
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

  async function handleReact(emoji: string) {
    setPickerOpen(false);
    try {
      await invoke('react_comment', {
        rid,
        issueId,
        commentId: comment.id,
        emoji,
        active: true,
      });
      onRefresh();
    } catch (e) {
      console.error(e);
    }
  }

  if (isBanned && !expanded) {
    return (
      <div className={`${styles.comment} ${depth > 0 ? styles.reply : ''} ${styles.commentBanned}`}>
        <div className={styles.bannedHeader}>
          <span className={styles.bannedMeta}>
            <Avatar name={comment.author} />
            <span>@{comment.author}</span>
            <span className={styles.bannedLabel}>banned</span>
          </span>
          <button className={styles.expandBtn} onClick={() => setExpanded(true)}>expand</button>
        </div>
        {comment.replies.length > 0 && (
          <div className={styles.replyThread}>
            {comment.replies.map((reply) => (
              <CommentThread
                key={reply.id}
                comment={reply}
                depth={depth + 1}
                issueId={issueId}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`${styles.comment} ${depth > 0 ? styles.reply : ''}`}>
      <div className={styles.commentHeader}>
        <Avatar name={comment.author} size={depth > 0 ? 'sm' : 'md'} />
        <span className={styles.commentAuthor}>{comment.author}</span>
        <span className={styles.commentDate}>{comment.createdAt}</span>
        {canBanUser(comment.authorDid) && (
          <button
            className={styles.banBtn}
            onClick={() => onBanUser(comment.authorDid, comment.author, 'all')}
            title="Ban user"
          >⊘</button>
        )}
      </div>
      <div className={styles.commentContent}>
        <p className={styles.commentBody}>{comment.body}</p>
        <div className={styles.commentActions}>
          <ReactionBar
            reactions={comment.reactions}
            onReact={handleReact}
            onPickerOpen={() => setPickerOpen(true)}
          />
          {pickerOpen && (
            <EmojiPicker onSelect={handleReact} onClose={() => setPickerOpen(false)} />
          )}
          <button className={styles.replyBtn} onClick={openReply}>reply</button>
        </div>

        {replying && (
          <div className={styles.replyForm}>
            <MarkdownEditor
              ref={textareaRef}
              className={styles.commentInput}
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Write a reply…"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitReply();
                if (e.key === 'Escape') { setReplying(false); setReplyBody(''); }
              }}
            />
            <div className={styles.formActions}>
              <Button size="sm" onClick={() => { setReplying(false); setReplyBody(''); }}>
                cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={submitReply}
                disabled={submitting || !replyBody.trim()}
              >
                {submitting ? '…' : 'reply'}
              </Button>
            </div>
          </div>
        )}

        {comment.replies.length > 0 && (
          <div className={styles.replyThread}>
            {comment.replies.map((reply) => (
              <CommentThread
                key={reply.id}
                comment={reply}
                depth={depth + 1}
                issueId={issueId}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
