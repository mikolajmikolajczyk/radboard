import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { RawCommentData } from '../../types/radboard';
import styles from './DiffView.module.css';

export interface FileDiff {
  path: string;
  lines: string[];
}

export function parseDiff(raw: string): FileDiff[] {
  const result: FileDiff[] = [];
  let current: FileDiff | null = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('diff --git ')) {
      if (current) result.push(current);
      const m = line.match(/diff --git a\/.+ b\/(.+)/);
      current = { path: m ? m[1] : line, lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) result.push(current);
  return result;
}

interface ParsedLine {
  text: string;
  newLine: number | null;
  oldLine: number | null;
}

export function parseDiffLines(lines: string[]): ParsedLine[] {
  let newLine = 0;
  let oldLine = 0;
  return lines.map((line) => {
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldLine = parseInt(hunk[1]) - 1;
      newLine = parseInt(hunk[2]) - 1;
      return { text: line, newLine: null, oldLine: null };
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      newLine++;
      return { text: line, newLine, oldLine: null };
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      oldLine++;
      return { text: line, newLine: null, oldLine };
    }
    const isMeta =
      line.startsWith('diff ') ||
      line.startsWith('index ') ||
      line.startsWith('---') ||
      line.startsWith('+++');
    if (!isMeta) {
      newLine++;
      oldLine++;
      return { text: line, newLine, oldLine };
    }
    return { text: line, newLine: null, oldLine: null };
  });
}

// ── Inline comment thread ─────────────────────────────────────────────────────

interface InlineCommentItemProps {
  comment: RawCommentData;
  rid?: string;
  patchId?: string;
  revisionId?: string;
  commitOid?: string;
  filePath?: string;
  newLine?: number;
  depth?: number;
  onCommentAdded?: () => void;
}

export function InlineCommentItem({
  comment,
  rid,
  patchId,
  revisionId,
  commitOid,
  filePath,
  newLine,
  depth = 0,
  onCommentAdded,
}: InlineCommentItemProps) {
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canReply = !!(rid && patchId && revisionId && commitOid && filePath && newLine);

  async function submitReply() {
    if (!canReply || !replyBody.trim()) return;
    setSubmitting(true);
    try {
      await invoke('add_patch_line_comment', {
        rid,
        patchId,
        revisionId,
        body: replyBody.trim(),
        replyTo: comment.id,
        commitOid,
        filePath,
        newLine,
        oldLine: null,
      });
      setReplying(false);
      setReplyBody('');
      onCommentAdded?.();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  const indent = depth * 16;

  return (
    <>
      <div
        className={`${styles.inlineCommentBlock} ${depth > 0 ? styles.inlineCommentBlockReply : ''}`}
        style={depth > 0 ? { paddingLeft: 12 + indent } : undefined}
      >
        <span className={styles.inlineCommentAuthor}>@{comment.author}</span>
        <span className={styles.inlineCommentBodyInline}>{comment.body}</span>
        {canReply && !replying && (
          <button className={styles.inlineReplyBtn} onClick={() => setReplying(true)}>reply</button>
        )}
      </div>
      {replying && (
        <div
          className={styles.inlineCommentForm}
          style={depth > 0 ? { paddingLeft: indent } : undefined}
        >
          <textarea
            className={styles.inlineCommentTextarea}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Write a reply…"
            rows={2}
            autoFocus
          />
          <div className={styles.inlineCommentActions}>
            <button
              className={styles.inlineCommentSubmit}
              disabled={!replyBody.trim() || submitting}
              onClick={submitReply}
            >{submitting ? 'Posting…' : 'Reply'}</button>
            <button
              className={styles.inlineCommentCancel}
              onClick={() => { setReplying(false); setReplyBody(''); }}
            >Cancel</button>
          </div>
        </div>
      )}
      {comment.replies?.map((reply) => (
        <InlineCommentItem
          key={reply.id}
          comment={reply}
          rid={rid}
          patchId={patchId}
          revisionId={revisionId}
          commitOid={commitOid}
          filePath={filePath}
          newLine={newLine}
          depth={depth + 1}
          onCommentAdded={onCommentAdded}
        />
      ))}
    </>
  );
}

// ── FileDiffBox ───────────────────────────────────────────────────────────────

export function FileDiffBox({
  file,
  basePath,
  preferredEditor,
  onViewFile,
  lineComments,
  commitOid,
  revisionId,
  rid,
  patchId,
  onLineCommentAdded,
}: {
  file: FileDiff;
  basePath?: string;
  preferredEditor?: string | null;
  onViewFile?: () => void;
  lineComments?: Map<number, RawCommentData[]>;
  commitOid?: string;
  revisionId?: string;
  rid?: string;
  patchId?: string;
  onLineCommentAdded?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const [commentingLine, setCommentingLine] = useState<number | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function openInEditor() {
    if (!preferredEditor || !basePath) return;
    invoke('open_in_editor', {
      editor: preferredEditor,
      path: `${basePath}/${file.path}`,
    });
  }

  async function handleSubmitLineComment(newLine: number, oldLine: number | null) {
    if (!commentBody.trim() || !rid || !patchId || !revisionId || !commitOid) return;
    setSubmitting(true);
    try {
      await invoke('add_patch_line_comment', {
        rid,
        patchId,
        revisionId,
        body: commentBody.trim(),
        replyTo: null,
        commitOid,
        filePath: file.path,
        newLine,
        oldLine,
      });
      setCommentingLine(null);
      setCommentBody('');
      onLineCommentAdded?.();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  const parsedLines = parseDiffLines(file.lines);
  const canComment = !!(commitOid && rid && patchId && revisionId);

  return (
    <div className={styles.fileDiffBox}>
      <div className={styles.fileDiffHeader}>
        <button
          className={styles.fileDiffToggle}
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▶' : '▼'}
        </button>
        <span className={styles.fileDiffPath}>{file.path}</span>
        {onViewFile && (
          <button
            className={styles.fileDiffOpenBtn}
            onClick={onViewFile}
            title="View file"
          >
            view
          </button>
        )}
        {preferredEditor && basePath && (
          <button
            className={styles.fileDiffOpenBtn}
            onClick={openInEditor}
            title={`Open in ${preferredEditor}`}
          >
            open
          </button>
        )}
      </div>
      {!collapsed && (
        <div className={styles.fileDiffLines}>
          {parsedLines.map((pl, i) => {
            let cls = styles.diffLine;
            if (pl.text.startsWith('+') && !pl.text.startsWith('+++')) cls = styles.diffAdded;
            else if (pl.text.startsWith('-') && !pl.text.startsWith('---')) cls = styles.diffRemoved;
            else if (pl.text.startsWith('@@')) cls = styles.diffHunk;
            else if (
              pl.text.startsWith('diff ') ||
              pl.text.startsWith('index ') ||
              pl.text.startsWith('---') ||
              pl.text.startsWith('+++')
            )
              cls = styles.diffMeta;

            const commentsHere = pl.newLine ? (lineComments?.get(pl.newLine) ?? []) : [];
            const isCommentable = canComment && pl.newLine !== null;

            return (
              <React.Fragment key={i}>
                <div
                  className={`${cls} ${styles.diffLineRow} ${hoveredLine === i && isCommentable ? styles.diffLineHovered : ''}`}
                  style={isCommentable ? { cursor: 'pointer' } : undefined}
                  onMouseEnter={() => isCommentable ? setHoveredLine(i) : undefined}
                  onMouseLeave={() => setHoveredLine(null)}
                  onClick={() => isCommentable && pl.newLine !== null ? setCommentingLine(pl.newLine) : undefined}
                >
                  <span className={styles.lineNum}>{pl.newLine ?? ''}</span>
                  <span className={styles.lineContent}>{pl.text || ' '}</span>
                </div>
                {commentingLine === pl.newLine && pl.newLine !== null && (
                  <div className={styles.inlineCommentForm}>
                    <textarea
                      className={styles.inlineCommentTextarea}
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      placeholder="Leave a comment…"
                      rows={3}
                      autoFocus
                    />
                    <div className={styles.inlineCommentActions}>
                      <button
                        className={styles.inlineCommentSubmit}
                        disabled={!commentBody.trim() || submitting}
                        onClick={() => handleSubmitLineComment(pl.newLine!, pl.oldLine)}
                      >{submitting ? 'Posting…' : 'Comment'}</button>
                      <button
                        className={styles.inlineCommentCancel}
                        onClick={() => { setCommentingLine(null); setCommentBody(''); }}
                      >Cancel</button>
                    </div>
                  </div>
                )}
                {commentsHere.map((c) => (
                  <InlineCommentItem
                    key={c.id}
                    comment={c}
                    rid={rid}
                    patchId={patchId}
                    revisionId={revisionId}
                    commitOid={commitOid}
                    filePath={file.path}
                    newLine={pl.newLine ?? undefined}
                    onCommentAdded={onLineCommentAdded}
                  />
                ))}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
