import { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileDiffBox, parseDiff } from './DiffView';
import type { FileDiff } from './DiffView';
import type { IssueComment, PatchReview, PatchRef } from '../../types/kanban';
import type { RawCommentData, RawPatchDetailData, RawPatchReviewData, RawPatchRevisionRef, WorktreeInfo } from '../../types/radboard';
import ConfirmDialog from '../shared/ConfirmDialog';
import PatchFromWorktreeModal from './PatchFromWorktreeModal';
import { PatchComment } from './PatchComment';
import { RevisionPicker } from './RevisionPicker';
import { ReviewSection } from './ReviewSection';
import styles from './PatchDetail.module.css';
import { Badge } from '../../ui';
import { worktreeBranchName } from '../../utils/names';
import { useRepo } from '../../contexts/RepoContext';
import { useActions } from '../../contexts/ActionsContext';

export interface PatchDetailProps {
  patch: PatchRef;
  issueId?: string;
  initialRevisionId?: string;
  isViewActive?: boolean;
  onPatchStateChange?: () => void;
  onClose?: () => void;
}

const EMOJI_LIST = ['👍', '👎', '❤️', '🎉', '😄', '😕', '🚀', '👀'];


const ISSUE_PREFIX_RE = /\[([0-9a-f]{7})\]/i;


function renderPatchTitle(title: string, onOpenIssue?: (prefix: string) => void, css?: string) {
  const m = title.match(ISSUE_PREFIX_RE);
  if (!m || !onOpenIssue) return title;
  const [full, prefix] = m;
  const idx = title.indexOf(full);
  return (
    <>
      <span
        className={css}
        style={{ cursor: 'pointer', color: '#5de4c7' }}
        onClick={() => onOpenIssue(prefix)}
        title={`Open issue ${prefix}`}
      >{full}</span>
      {title.slice(idx + full.length)}
    </>
  );
}

function msToDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mapComment(raw: RawCommentData): IssueComment {
  return {
    id: raw.id,
    author: raw.author,
    authorDid: raw.authorDid,
    body: raw.body,
    createdAt: msToDate(raw.createdAt),
    reactions: raw.reactions,
    replies: raw.replies.map(mapComment),
  };
}

function mapReview(raw: RawPatchReviewData): PatchReview {
  return {
    reviewer: raw.reviewer,
    reviewerDid: raw.reviewerDid,
    verdict: raw.verdict,
    summary: raw.summary,
    createdAt: msToDate(raw.createdAt),
  };
}

export default function PatchDetail({
  patch,
  issueId = '',
  initialRevisionId,
  isViewActive = true,
  onPatchStateChange,
  onClose,
}: PatchDetailProps) {
  const { rid, localRepoPath, defaultBranch = 'master', myDid = null, preferredEditor, delegateDids = [] } = useRepo();
  const { onBrowseFile, onViewPatchFile, onOpenIssue } = useActions();
  const [fileDiffs, setFileDiffs] = useState<FileDiff[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewColWidth, setReviewColWidth] = useState(360);

  const [selectedRevisionId, setSelectedRevisionId] = useState(initialRevisionId ?? '');
  const [revisions, setRevisions] = useState<RawPatchRevisionRef[]>([]);
  const [detail, setDetail] = useState<{ comments: IssueComment[]; reviews: PatchReview[] } | null>(null);
  const [rawComments, setRawComments] = useState<RawCommentData[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [commentBody, setCommentBody] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [merging, setMerging] = useState(false);
  const [confirm, setConfirm] = useState<'archive' | 'merge' | null>(null);
  const [matchingWorktree, setMatchingWorktree] = useState<WorktreeInfo | null>(null);
  const [removeWorktree, setRemoveWorktree] = useState(true);
  const [patchSync, setPatchSync] = useState<{ ahead: number; behind: number; conflicts: string[] } | null>(null);

  const [worktreeChanges, setWorktreeChanges] = useState<number | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutBranch, setCheckoutBranch] = useState('');
  const [checkoutPath, setCheckoutPath] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutDone, setCheckoutDone] = useState(false);

  const loadDetail = useCallback((revId: string) => {
    setLoadingDetail(true);
    invoke<RawPatchDetailData>('get_patch_detail', { rid, patchId: patch.id, revisionId: revId })
      .then((d) => {
        setRevisions(d.revisions);
        setSelectedRevisionId(d.revisionId);
        setRawComments(d.comments);
        setDetail({
          comments: d.comments.filter((c) => !c.location).map(mapComment),
          reviews: d.reviews.map(mapReview),
        });
      })
      .catch(console.error)
      .finally(() => setLoadingDetail(false));
  }, [rid, patch.id]);

  const loadDiff = useCallback((revId: string) => {
    setFileDiffs([]);
    setError(null);
    setLoading(true);
    invoke<string>('get_patch_diff', { rid, patchId: patch.id, revisionId: revId })
      .then((raw) => setFileDiffs(parseDiff(raw)))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [rid, patch.id]);

  useEffect(() => {
    const revId = initialRevisionId ?? '';
    loadDiff(revId); loadDetail(revId);
    setMatchingWorktree(null);
    setWorktreeChanges(null);
    const issuePrefixFromTitle = patch.title.match(ISSUE_PREFIX_RE)?.[1] ?? null;
    const worktreePrefix = issueId ? issueId.slice(0, 7) : issuePrefixFromTitle;
    if (localRepoPath && worktreePrefix) {
      invoke<WorktreeInfo[]>('list_worktrees', { localPath: localRepoPath })
        .then((all) => {
          const match = all.find((w) => w.branch.includes(worktreePrefix));
          setMatchingWorktree(match ?? null);
          if (match) {
            invoke<{ path: string; status: string }[]>('get_worktree_status', { worktreePath: match.path })
              .then((s) => setWorktreeChanges(s.length))
              .catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, [patch.id, rid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!localRepoPath || !patch.head || !defaultBranch) {
      setPatchSync(null);
      return;
    }
    invoke<{ ahead: number; behind: number; conflicts: string[] }>('check_patch_sync', {
      localRepoPath,
      baseBranch: defaultBranch,
      patchHead: patch.head,
    })
      .then(setPatchSync)
      .catch(() => setPatchSync(null));
  }, [localRepoPath, defaultBranch, patch.head]);

  useEffect(() => {
    if (!matchingWorktree || !isViewActive) return;
    const poll = () => {
      invoke<{ path: string; status: string }[]>('get_worktree_status', { worktreePath: matchingWorktree.path })
        .then((s) => setWorktreeChanges(s.length))
        .catch(() => {});
    };
    const id = setInterval(poll, 3000);
    window.addEventListener('focus', poll);
    return () => { clearInterval(id); window.removeEventListener('focus', poll); };
  }, [matchingWorktree?.path, isViewActive]);

  function selectRevision(revId: string) {
    setSelectedRevisionId(revId);
    loadDiff(revId);
    loadDetail(revId);
  }

  const startColResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = reviewColWidth;
      const onMove = (ev: PointerEvent) => {
        const delta = startX - ev.clientX;
        setReviewColWidth(Math.max(240, Math.min(startWidth + delta, 600)));
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [reviewColWidth]
  );

  async function submitComment() {
    if (!commentBody.trim()) return;
    setSubmittingComment(true);
    try {
      await invoke('add_patch_comment', { rid, patchId: patch.id, revisionId: selectedRevisionId, body: commentBody.trim() });
      setCommentBody('');
      loadDetail(selectedRevisionId);
    } catch (e) {
      console.error(e);
    } finally {
      setSubmittingComment(false);
    }
  }

  async function cleanupWorktree() {
    if (removeWorktree && matchingWorktree && localRepoPath) {
      try {
        await invoke('remove_worktree', { localPath: localRepoPath, worktreePath: matchingWorktree.path });
      } catch (e) {
        console.error('Failed to remove worktree:', e);
      }
    }
  }

  const selectedRevisionHead = revisions.find((r) => r.id === selectedRevisionId)?.head ?? patch.head;

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

  function openCheckout() {
    const issuePrefixFromTitle = patch.title.match(ISSUE_PREFIX_RE)?.[1] ?? null;
    const issuePrefix = issueId ? issueId.slice(0, 7) : (issuePrefixFromTitle ?? patch.id.slice(0, 7));
    const branch = worktreeBranchName(issuePrefix, localRepoPath, patch.id);
    setCheckoutBranch(branch);
    setCheckoutPath(localRepoPath ? `${localRepoPath}/../${branch}` : '');
    setCheckoutError(null);
    setCheckoutDone(false);
    setShowCheckout(true);
  }

  async function handleCheckout() {
    if (!localRepoPath || !checkoutBranch || !checkoutPath) return;
    setCheckingOut(true);
    setCheckoutError(null);
    try {
      await invoke('create_worktree_from_patch', {
        localPath: localRepoPath,
        worktreePath: checkoutPath,
        branchName: checkoutBranch,
        commitOid: selectedRevisionHead,
      });
      // Refresh worktree list — this switches the UI from checkout form to "worktree exists"
      const all = await invoke<WorktreeInfo[]>('list_worktrees', { localPath: localRepoPath });
      const created = all.find((w) => w.branch === checkoutBranch);
      setMatchingWorktree(created ?? null);
      setWorktreeChanges(0); // freshly checked out — no local changes yet
      setShowCheckout(false);
    } catch (e) {
      setCheckoutError(String(e));
    } finally {
      setCheckingOut(false);
    }
  }

  async function handleWorktreeUpdate() {
    if (!matchingWorktree) return;
    setCheckingOut(true);
    setCheckoutError(null);
    try {
      await invoke('update_worktree', {
        worktreePath: matchingWorktree.path,
        commitOid: selectedRevisionHead,
      });
      setMatchingWorktree({ ...matchingWorktree, head: selectedRevisionHead });
      setCheckoutDone(true);
    } catch (e) {
      setCheckoutError(String(e));
    } finally {
      setCheckingOut(false);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    setActionError(null);
    try {
      await invoke('archive_patch', { rid, patchId: patch.id });
      await cleanupWorktree();
      onPatchStateChange?.();
      onClose?.();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setArchiving(false);
    }
  }

  async function handleMerge() {
    if (!localRepoPath) return;
    setMerging(true);
    setActionError(null);
    try {
      await invoke('merge_patch', {
        localRepoPath,
        defaultBranch,
        patchHead: patch.head,
      });
      await cleanupWorktree();
      onPatchStateChange?.();
      onClose?.();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setMerging(false);
    }
  }

  const isActive = patch.state === 'open' || patch.state === 'draft';

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Badge variant={patch.state}>{patch.state}</Badge>
          <span className={styles.title}>{renderPatchTitle(patch.title, onOpenIssue)}</span>
        </div>
        {onClose && (
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.meta}>
          <span className={styles.metaAuthor}>@{patch.author}</span>
          <RevisionPicker
            revisions={revisions}
            selectedId={selectedRevisionId}
            onSelect={selectRevision}
          />
          {loading && <span className={styles.hint}>loading diff…</span>}
        </div>

        <div className={styles.columns}>
          {/* Left: diff */}
          <div className={styles.diffCol}>
            {error ? (
              <div className={styles.error}>{error}</div>
            ) : !loading && fileDiffs.length === 0 ? (
              <span className={styles.hint}>No diff available</span>
            ) : (
              fileDiffs.map((fd) => (
                <FileDiffBox
                  key={fd.path}
                  file={fd}
                  basePath={localRepoPath ?? undefined}
                  preferredEditor={preferredEditor}
                  onViewFile={
                    onViewPatchFile
                      ? () => onViewPatchFile(fileDiffs, patch.head, patch.title, fd.path, patch.id, selectedRevisionId)
                      : onBrowseFile
                        ? () => onBrowseFile(patch.head, fd.path)
                        : undefined
                  }
                  lineComments={lineCommentsByFile.get(fd.path)}
                  commitOid={selectedRevisionHead}
                  revisionId={selectedRevisionId}
                  rid={rid}
                  patchId={patch.id}
                  onLineCommentAdded={() => loadDetail(selectedRevisionId)}
                />
              ))
            )}
          </div>

          {/* Column resize handle */}
          <div className={styles.colResizeHandle} onPointerDown={startColResize} />

          {/* Right: reviews + comments */}
          <div className={styles.reviewCol} style={{ width: reviewColWidth, minWidth: reviewColWidth }}>
            {loadingDetail && <span className={styles.hint}>Loading…</span>}

            {/* Checkout / Update */}
            {localRepoPath && (
              <div className={styles.worktreeSection}>
                <div className={styles.sectionLabel}>Worktree</div>
                {matchingWorktree ? (
                  <div className={styles.worktreeStatus}>
                    <span className={styles.checkoutOk} title={matchingWorktree.path}>
                      {matchingWorktree.branch}
                      {matchingWorktree.head === selectedRevisionHead ? ' ✓' : ' ⚠ outdated'}
                    </span>
                    {worktreeChanges !== null && worktreeChanges > 0 && (
                      <span className={styles.worktreeChanges}>
                        {worktreeChanges} uncommitted {worktreeChanges === 1 ? 'change' : 'changes'}
                      </span>
                    )}
                    <div className={styles.worktreeBtns}>
                      {preferredEditor && (
                        <button className={styles.checkoutBtn} onClick={() => invoke('open_in_editor', { editor: preferredEditor, path: matchingWorktree.path }).catch(console.error)}>
                          Open
                        </button>
                      )}
                      {matchingWorktree.head !== selectedRevisionHead && (
                        <button
                          className={styles.checkoutBtn}
                          onClick={handleWorktreeUpdate}
                          disabled={checkingOut}
                          title={`Reset to ${selectedRevisionHead.slice(0, 7)}`}
                        >
                          {checkingOut ? 'Updating…' : 'Update worktree'}
                        </button>
                      )}
                      <button
                        className={`${styles.checkoutBtn} ${worktreeChanges ? styles.checkoutBtnDirty : ''}`}
                        onClick={() => setShowUpdateModal(true)}
                      >
                        Update patch
                      </button>
                    </div>
                    {checkoutError && <span className={styles.actionError}>{checkoutError}</span>}
                  </div>
                ) : !showCheckout ? (
                  <button className={styles.checkoutBtn} onClick={openCheckout}>
                    Checkout
                  </button>
                ) : (
                  <div className={styles.checkoutForm}>
                    <input
                      className={styles.checkoutInput}
                      value={checkoutBranch}
                      onChange={(e) => setCheckoutBranch(e.target.value)}
                      placeholder="branch name"
                    />
                    <input
                      className={styles.checkoutInput}
                      value={checkoutPath}
                      onChange={(e) => setCheckoutPath(e.target.value)}
                      placeholder="worktree path"
                    />
                    <button
                      className={styles.mergeBtn}
                      onClick={handleCheckout}
                      disabled={checkingOut || !checkoutBranch || !checkoutPath}
                    >
                      {checkingOut ? 'Creating…' : 'Create worktree'}
                    </button>
                    <button className={styles.archiveBtn} onClick={() => setShowCheckout(false)}>
                      Cancel
                    </button>
                    {checkoutError && <span className={styles.actionError}>{checkoutError}</span>}
                    {checkoutDone && <span className={styles.checkoutOk}>Created ✓</span>}
                  </div>
                )}
              </div>
            )}

            {/* Reviews section + Add review form */}
            <ReviewSection
              reviews={detail?.reviews ?? []}
              delegateDids={delegateDids}
              canReview={isActive}
              rid={rid}
              patchId={patch.id}
              revisionId={selectedRevisionId}
              onReviewSubmitted={() => loadDetail(selectedRevisionId)}
            />

            {/* Comments */}
            <div className={styles.commentsSection}>
              <div className={styles.sectionLabel}>
                Comments {detail && detail.comments.length > 0 && `(${detail.comments.length})`}
              </div>
              {detail && detail.comments.length === 0 && (
                <span className={styles.hint}>No comments yet</span>
              )}
              {detail?.comments.map((c) => (
                <PatchComment
                  key={c.id}
                  comment={c}
                  patchId={patch.id}
                  revisionId={selectedRevisionId}
                  onRefresh={() => loadDetail(selectedRevisionId)}
                />
              ))}
            </div>

            {/* New comment form */}
            <div className={styles.newCommentForm}>
              <div className={styles.commentInputRow}>
                <textarea
                  className={styles.patchCommentInput}
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder="Add a comment…"
                  rows={3}
                />
                <div className={styles.emojiRow}>
                  {EMOJI_LIST.map((e) => (
                    <button
                      key={e}
                      className={styles.quickEmoji}
                      onClick={() => setCommentBody((b) => b + e)}
                      title={e}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <button
                className={styles.patchSubmitBtn}
                onClick={submitComment}
                disabled={submittingComment || !commentBody.trim()}
              >
                {submittingComment ? 'Posting…' : 'Comment'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {myDid && (patch.state === 'open' || patch.state === 'draft') && (
        delegateDids.includes(myDid) || patch.authorDid === myDid
      ) && (
        <div className={styles.bottomBar}>
          <span className={styles.bottomBarLabel}>Actions</span>
          {/* Merge: delegates only */}
          {patch.state === 'open' && localRepoPath && delegateDids.includes(myDid) && (() => {
            const blocked = (patchSync?.conflicts.length ?? 0) > 0;
            const stale = !blocked && (patchSync?.behind ?? 0) > 0;
            const tip = blocked
              ? `Cannot merge: ${patchSync!.conflicts.length} file${patchSync!.conflicts.length === 1 ? '' : 's'} conflict with ${defaultBranch}. Patch author must rebase first.`
              : stale
                ? `${patchSync!.behind} commit${patchSync!.behind === 1 ? '' : 's'} behind ${defaultBranch}; will create a merge commit.`
                : `Merge into ${defaultBranch} and push`;
            return (
              <button
                className={styles.mergeBtn}
                onClick={() => setConfirm('merge')}
                disabled={merging || archiving || blocked}
                title={tip}
              >
                {merging ? 'Merging…' : blocked ? '⎇ Merge (blocked)' : stale ? '⎇ Merge (stale)' : '⎇ Merge'}
              </button>
            );
          })()}
          {/* Lifecycle (archive): patch author or delegate */}
          {(patch.authorDid === myDid || delegateDids.includes(myDid)) && (
            <button
              className={styles.archiveBtn}
              onClick={() => setConfirm('archive')}
              disabled={archiving || merging}
            >
              {archiving ? 'Archiving…' : 'Archive'}
            </button>
          )}
          {actionError && <span className={styles.actionError}>{actionError}</span>}
        </div>
      )}

      {matchingWorktree && (
        <PatchFromWorktreeModal
          open={showUpdateModal}
          worktreePath={matchingWorktree.path}
          issueId={issueId || patch.title.match(ISSUE_PREFIX_RE)?.[1] || patch.id.slice(0, 7)}
          issueTitle={patch.title.replace(ISSUE_PREFIX_RE, '').trim()}
          mode="update"
          patchId={patch.id}
          patchTitle={patch.title}
          preferredEditor={preferredEditor}
          onSuccess={() => { setShowUpdateModal(false); setWorktreeChanges(0); onPatchStateChange?.(); loadDetail(selectedRevisionId); }}
          onClose={() => setShowUpdateModal(false)}
        />
      )}

      <ConfirmDialog
        open={confirm === 'merge'}
        title="Merge patch"
        message={`Merge "${patch.title}" into ${defaultBranch} and push to rad?`}
        confirmLabel="Merge"
        onConfirm={() => { setConfirm(null); handleMerge(); }}
        onCancel={() => setConfirm(null)}
      >
        {matchingWorktree && (
          <label className={styles.worktreeCheck}>
            <input type="checkbox" checked={removeWorktree} onChange={(e) => setRemoveWorktree(e.target.checked)} />
            Remove local worktree ({matchingWorktree.branch})
          </label>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'archive'}
        title="Archive patch"
        message={`Archive "${patch.title}"? It will no longer appear in the open patches list.`}
        confirmLabel="Archive"
        onConfirm={() => { setConfirm(null); handleArchive(); }}
        onCancel={() => setConfirm(null)}
      >
        {matchingWorktree && (
          <label className={styles.worktreeCheck}>
            <input type="checkbox" checked={removeWorktree} onChange={(e) => setRemoveWorktree(e.target.checked)} />
            Remove local worktree ({matchingWorktree.branch})
          </label>
        )}
      </ConfirmDialog>
    </div>
  );
}
