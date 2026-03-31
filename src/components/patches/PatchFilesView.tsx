import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Prism as SyntaxHighlighter, createElement } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { FileDiffBox, InlineCommentItem, parseDiff } from './DiffView';
import type { FileDiff } from './DiffView';
import type { BlobContentData, RawCommentData, RawPatchDetailData, RawPatchRevisionRef } from '../../types/radboard';
import { getLanguage } from '../../utils/languageMap';
import styles from './PatchFilesView.module.css';

interface Props {
  rid: string;
  fileDiffs: FileDiff[];
  commitOid: string;
  patchTitle: string;
  patchId: string;
  initialRevisionId: string;
  initialPath: string | null;
  onReturn: (activeRevisionId: string) => void;
}

function isDeletedFile(lines: string[]): boolean {
  return lines.some((l) => l.startsWith('+++ /dev/null'));
}

function diffStats(lines: string[]): { added: number; removed: number } {
  let added = 0, removed = 0;
  for (const l of lines) {
    if (l.startsWith('+') && !l.startsWith('+++')) added++;
    else if (l.startsWith('-') && !l.startsWith('---')) removed++;
  }
  return { added, removed };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Mixed view ─────────────────────────────────────────────────────────────────

function parseDiffAnnotations(diffLines: string[]): {
  addedLineNums: Set<number>;
  removedBefore: Map<number, string[]>;
} {
  const addedLineNums = new Set<number>();
  const removedBefore = new Map<number, string[]>();

  let i = 0;
  while (i < diffLines.length) {
    const hunkMatch = diffLines[i].match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      let newLine = parseInt(hunkMatch[1], 10);
      i++;
      while (i < diffLines.length && !diffLines[i].startsWith('@@') && !diffLines[i].startsWith('diff ')) {
        const l = diffLines[i];
        if (l.startsWith('+') && !l.startsWith('+++')) {
          addedLineNums.add(newLine);
          newLine++;
        } else if (l.startsWith('-') && !l.startsWith('---')) {
          const arr = removedBefore.get(newLine) ?? [];
          arr.push(l.slice(1));
          removedBefore.set(newLine, arr);
        } else if (!l.startsWith('---') && !l.startsWith('+++')) {
          newLine++; // context line
        }
        i++;
      }
    } else {
      i++;
    }
  }

  return { addedLineNums, removedBefore };
}

interface MixedViewProps {
  diffLines: string[];
  sourceContent: string;
  filename: string;
  filePath: string;
  lineComments?: Map<number, RawCommentData[]>;
  rid?: string;
  patchId?: string;
  revisionId?: string;
  commitOid?: string;
  onLineCommentAdded?: () => void;
}

function MixedView({ diffLines, sourceContent, filename, filePath, lineComments, rid, patchId, revisionId, commitOid, onLineCommentAdded }: MixedViewProps) {
  const { addedLineNums, removedBefore } = parseDiffAnnotations(diffLines);
  const [commentingLine, setCommentingLine] = useState<number | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canComment = !!(rid && patchId && revisionId && commitOid);

  async function handleSubmitLineComment(newLine: number) {
    if (!commentBody.trim() || !rid || !patchId || !revisionId || !commitOid) return;
    setSubmitting(true);
    try {
      await invoke('add_patch_line_comment', {
        rid, patchId, revisionId, body: commentBody.trim(),
        replyTo: null, commitOid, filePath, newLine, oldLine: null,
      });
      setCommentingLine(null);
      setCommentBody('');
      onLineCommentAdded?.();
    } catch (e) { console.error(e); }
    finally { setSubmitting(false); }
  }

  const sourceLines = sourceContent.split('\n');
  if (sourceLines[sourceLines.length - 1] === '') sourceLines.pop();
  const lineNumWidth = String(sourceLines.length).length;

  const renderer = ({ rows, stylesheet, useInlineStyles }: { rows: any[]; stylesheet: any; useInlineStyles: boolean }) => {
    const result: React.ReactNode[] = [];

    rows.forEach((row, i) => {
      const lineNum = i + 1;
      if (lineNum > sourceLines.length) return;

      const removed = removedBefore.get(lineNum) ?? [];
      for (let ri = 0; ri < removed.length; ri++) {
        result.push(
          <div key={`r-${lineNum}-${ri}`} className={styles.mixedRemoved}>
            <span className={styles.mixedLineNum}>{' '.repeat(lineNumWidth)}</span>
            <span className={styles.mixedSign}>-</span>
            <span className={styles.mixedRemovedContent}>{removed[ri] || ' '}</span>
          </div>
        );
      }

      const isAdded = addedLineNums.has(lineNum);
      const isHoverable = canComment;
      result.push(
        <div
          key={`s-${lineNum}`}
          className={`${styles.mixedSource} ${isAdded ? styles.mixedAdded : ''} ${isHoverable ? styles.mixedClickable : ''}`}
          onClick={() => isHoverable ? setCommentingLine(lineNum) : undefined}
        >
          <span className={styles.mixedLineNum}>{String(lineNum).padStart(lineNumWidth)}</span>
          <span className={styles.mixedSign}>{isAdded ? '+' : ' '}</span>
          {createElement({ node: row, stylesheet, useInlineStyles, key: `t-${lineNum}` })}
        </div>
      );

      // New comment form for this line
      if (commentingLine === lineNum) {
        result.push(
          <div key={`cf-${lineNum}`} className={styles.mixedCommentForm}>
            <textarea
              className={styles.mixedCommentTextarea}
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              placeholder="Leave a comment…"
              rows={3}
              autoFocus
            />
            <div className={styles.mixedCommentActions}>
              <button
                className={styles.mixedCommentSubmit}
                disabled={!commentBody.trim() || submitting}
                onClick={() => handleSubmitLineComment(lineNum)}
              >{submitting ? 'Posting…' : 'Comment'}</button>
              <button
                className={styles.mixedCommentCancel}
                onClick={() => { setCommentingLine(null); setCommentBody(''); }}
              >Cancel</button>
            </div>
          </div>
        );
      }

      // Existing comments for this line
      const commentsHere = lineComments?.get(lineNum) ?? [];
      for (const c of commentsHere) {
        result.push(
          <InlineCommentItem
            key={`ic-${c.id}`}
            comment={c}
            rid={rid}
            patchId={patchId}
            revisionId={revisionId}
            commitOid={commitOid}
            filePath={filePath}
            newLine={lineNum}
            onCommentAdded={onLineCommentAdded}
          />
        );
      }
    });

    // Removed lines trailing after the last source line
    const trailing = removedBefore.get(sourceLines.length + 1) ?? [];
    for (let ri = 0; ri < trailing.length; ri++) {
      result.push(
        <div key={`rt-${ri}`} className={styles.mixedRemoved}>
          <span className={styles.mixedLineNum}>{' '.repeat(lineNumWidth)}</span>
          <span className={styles.mixedSign}>-</span>
          <span className={styles.mixedRemovedContent}>{trailing[ri] || ' '}</span>
        </div>
      );
    }

    return <>{result}</>;
  };

  return (
    <SyntaxHighlighter
      style={vscDarkPlus}
      language={getLanguage(filename)}
      renderer={renderer}
      customStyle={{ margin: 0, borderRadius: 0, minHeight: '100%', fontSize: 11, background: 'var(--bg-base)', padding: '6px 0' }}
    >
      {sourceContent}
    </SyntaxHighlighter>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PatchFilesView({ rid, fileDiffs, commitOid, patchId, initialRevisionId, initialPath, onReturn }: Props) {
  const [currentDiffs, setCurrentDiffs] = useState<FileDiff[]>(fileDiffs);
  const [revisions, setRevisions] = useState<RawPatchRevisionRef[]>([]);
  const [activeRevisionId, setActiveRevisionId] = useState(initialRevisionId);
  const [activeCommitOid, setActiveCommitOid] = useState(commitOid);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [rawComments, setRawComments] = useState<RawCommentData[]>([]);

  const sorted = [...currentDiffs].sort((a, b) => a.path.localeCompare(b.path));

  const [selectedPath, setSelectedPath] = useState<string | null>(
    initialPath ?? (sorted[0]?.path ?? null)
  );
  const [activeTab, setActiveTab] = useState<'diff' | 'mixed' | 'source'>('diff');
  const [sourceCache, setSourceCache] = useState<Map<string, BlobContentData>>(new Map());
  const [loadingSource, setLoadingSource] = useState(false);

  function loadDetail(revId: string) {
    invoke<RawPatchDetailData>('get_patch_detail', { rid, patchId, revisionId: revId })
      .then((d) => {
        setRevisions(d.revisions);
        setRawComments(d.comments);
        // update commit oid to the selected revision's head
        const rev = d.revisions.find((r) => r.id === d.revisionId);
        if (rev) setActiveCommitOid(rev.head);
      })
      .catch(console.error);
  }

  // Fetch revision list + comments on mount
  useEffect(() => {
    loadDetail(initialRevisionId);
  }, [rid, patchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const lineCommentsByFile = useMemo(() => {
    const map = new Map<string, Map<number, RawCommentData[]>>();
    for (const c of rawComments) {
      if (!c.location?.newLine) continue;
      const path = c.location.path;
      if (!map.has(path)) map.set(path, new Map());
      const lineMap = map.get(path)!;
      const line = c.location.newLine;
      if (!lineMap.has(line)) lineMap.set(line, []);
      lineMap.get(line)!.push(c);
    }
    return map;
  }, [rawComments]);

  function switchRevision(revId: string) {
    if (revId === activeRevisionId) return;
    setActiveRevisionId(revId);
    setSourceCache(new Map());
    setLoadingDiff(true);
    invoke<string>('get_patch_diff', { rid, patchId, revisionId: revId })
      .then((raw) => {
        const diffs = parseDiff(raw);
        setCurrentDiffs(diffs);
        setSelectedPath((prev) => diffs.some((d) => d.path === prev) ? prev : (diffs[0]?.path ?? null));
      })
      .catch(console.error)
      .finally(() => setLoadingDiff(false));
    loadDetail(revId);
  }

  const selectedDiff = sorted.find((f) => f.path === selectedPath) ?? null;
  const sourceData = selectedPath ? sourceCache.get(selectedPath) : undefined;

  useEffect(() => {
    if ((activeTab !== 'source' && activeTab !== 'mixed') || !selectedPath) return;
    if (sourceCache.has(selectedPath)) return;
    if (selectedDiff && isDeletedFile(selectedDiff.lines)) return;
    setLoadingSource(true);
    invoke<BlobContentData>('read_blob', { rid, path: selectedPath, commitOid })
      .then((data) => setSourceCache((prev) => new Map(prev).set(selectedPath, data)))
      .catch(console.error)
      .finally(() => setLoadingSource(false));
  }, [activeTab, selectedPath, rid, commitOid]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={styles.container}>
      {/* Left: file list */}
      <div className={styles.listPanel}>
        <div className={styles.listHeader}>
          <button className={styles.backBtn} onClick={() => onReturn(activeRevisionId)}>← Patches</button>
          <div className={styles.listTitleRow}>
            <span className={styles.listTitle}>Files changed</span>
            {revisions.length > 1 && (
              <div className={styles.revisionPicker}>
                {revisions.map((rev, i) => (
                  <button
                    key={rev.id}
                    className={`${styles.revisionPill} ${rev.id === activeRevisionId ? styles.revisionPillActive : ''}`}
                    onClick={() => switchRevision(rev.id)}
                    title={rev.description || `Revision ${i + 1}`}
                    disabled={loadingDiff}
                  >
                    v{i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className={styles.fileList}>
          {sorted.map((fd) => {
            const stats = diffStats(fd.lines);
            return (
              <button
                key={fd.path}
                className={`${styles.fileRow} ${selectedPath === fd.path ? styles.fileRowActive : ''}`}
                onClick={() => setSelectedPath(fd.path)}
                title={fd.path}
              >
                <span className={styles.fileName}>{fd.path}</span>
                <span className={styles.fileStats}>
                  {stats.added > 0 && <span className={styles.statsAdded}>+{stats.added}</span>}
                  {stats.removed > 0 && <span className={styles.statsRemoved}>-{stats.removed}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: diff / mixed / source */}
      <div className={styles.contentPanel}>
        <div className={styles.contentHeader}>
          <div className={styles.tabs}>
            {(['diff', 'mixed', 'source'] as const).map((t) => (
              <button
                key={t}
                className={`${styles.tab} ${activeTab === t ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          {selectedPath && (
            <span className={styles.filePath}>{selectedPath}</span>
          )}
        </div>

        {activeTab !== 'diff' && sourceData?.isTruncated && (
          <div className={styles.truncatedBanner}>
            Showing first 1 MB of {formatSize(sourceData.size)}
          </div>
        )}

        <div className={styles.contentBody}>
          {!selectedDiff ? (
            <div className={styles.emptyContent}>No files changed</div>
          ) : activeTab === 'diff' ? (
            <FileDiffBox
              file={selectedDiff}
              lineComments={lineCommentsByFile.get(selectedDiff.path)}
              commitOid={activeCommitOid}
              revisionId={activeRevisionId}
              rid={rid}
              patchId={patchId}
              onLineCommentAdded={() => loadDetail(activeRevisionId)}
            />
          ) : isDeletedFile(selectedDiff.lines) ? (
            <div className={styles.binaryMessage}>File was deleted</div>
          ) : loadingSource && !sourceData ? (
            <div className={styles.loadingContent}>Loading…</div>
          ) : sourceData?.isBinary ? (
            <div className={styles.binaryMessage}>Binary file ({formatSize(sourceData.size)})</div>
          ) : sourceData && activeTab === 'mixed' ? (
            <MixedView
              diffLines={selectedDiff.lines}
              sourceContent={sourceData.content}
              filename={selectedPath?.split('/').pop() ?? ''}
              filePath={selectedDiff.path}
              lineComments={lineCommentsByFile.get(selectedDiff.path)}
              rid={rid}
              patchId={patchId}
              revisionId={activeRevisionId}
              commitOid={activeCommitOid}
              onLineCommentAdded={() => loadDetail(activeRevisionId)}
            />
          ) : sourceData && activeTab === 'source' ? (
            <SyntaxHighlighter
              style={vscDarkPlus}
              language={getLanguage(selectedPath?.split('/').pop() ?? '')}
              showLineNumbers
              wrapLongLines
              customStyle={{ margin: 0, borderRadius: 0, minHeight: '100%', fontSize: 12, background: 'var(--bg-surface)' }}
            >
              {sourceData.content}
            </SyntaxHighlighter>
          ) : (
            <div className={styles.loadingContent}>Loading…</div>
          )}
        </div>
      </div>
    </div>
  );
}
