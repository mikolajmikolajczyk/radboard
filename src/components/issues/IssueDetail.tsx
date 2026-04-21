import { useEffect, useRef, useState } from 'react';
import { useResizableDivider } from '../../ui';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { IssueDetail, IssueComment, PatchRef } from '../../types/kanban';
import type { RawCommentData, WorktreeInfo } from '../../types/radboard';
import styles from './IssueDetail.module.css';
import { worktreeBranchName } from '../../utils/names';
import PatchFromWorktreeModal from '../patches/PatchFromWorktreeModal';
import ConfirmDialog from '../shared/ConfirmDialog';
import PatchDiffModal from '../patches/PatchDiffModal';
import { MarkdownBody } from '../shared/MarkdownBody';
import { ReactionBar } from '../shared/ReactionBar';
import { EmojiPicker } from '../shared/EmojiPicker';
import { CommentThread } from '../shared/CommentThread';
import { LabelEditor } from './LabelEditor';
import { StateSelector } from './StateSelector';
import { PrioritySelector } from './PrioritySelector';
import { MilestonePicker } from '../milestones/MilestonePicker';
import { Badge, Button, Textarea } from '../../ui';
import { GitBranchPicker } from '../worktrees/GitBranchPicker';
import { useRepo } from '../../contexts/RepoContext';
import { useActions } from '../../contexts/ActionsContext';

interface Props {
  issue: IssueDetail | null;
  currentColumnId?: string;
  onClose: () => void;
  embedded?: boolean;
  sidebarWidth?: number;
  onSidebarWidthChange?: (width: number) => void;
}

function mapRawComment(raw: RawCommentData): IssueComment {
  return {
    id: raw.id,
    author: raw.author,
    authorDid: raw.authorDid,
    body: raw.body,
    createdAt: new Date(raw.createdAt).toISOString().slice(0, 16).replace('T', ' '),
    reactions: raw.reactions,
    replies: raw.replies.map(mapRawComment),
  };
}


export default function IssueDetail({ issue, currentColumnId, onClose, embedded = false, sidebarWidth: sidebarWidthProp, onSidebarWidthChange }: Props) {
  const { myDid, delegateDids, bannedUsers, explorerUrl, seedNode, localRepoPath, preferredEditor, milestoneSuggestions, milestonePrefix } = useRepo();
  const { onRefresh: actionsOnRefresh, onBanUser, onStateChange, onPriorityChange, onOpenPatch, onCommentsLoaded } = useActions();

  // ACL: Edit/Lifecycle → issue author only; Label → delegates only
  const isAuthor = myDid !== null && issue?.authorDid === myDid;
  const isDelegate = myDid !== null && delegateDids.includes(myDid);

  function canBanUser(did: string) {
    return myDid !== null && did !== myDid && !delegateDids.includes(did) && !bannedUsers.some((b) => b.did === did);
  }
  function issueUrl(rid: string, issueId: string): string | null {
    if (!explorerUrl || !seedNode) return null;
    return `${explorerUrl}/nodes/${seedNode}/${rid}/issues/${issueId}`;
  }

  function userUrl(did: string): string | null {
    if (!explorerUrl || !seedNode) return null;
    return `${explorerUrl}/nodes/${seedNode}/users/${did}`;
  }

  function patchUrl(rid: string, patchId: string): string | null {
    if (!explorerUrl || !seedNode) return null;
    return `${explorerUrl}/nodes/${seedNode}/${rid}/patches/${patchId}`;
  }

  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [descPickerOpen, setDescPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [worktreeState, setWorktreeState] = useState<
    | { status: 'idle' }
    | { status: 'picking-branch' }
    | { status: 'creating' }
    | { status: 'done'; path: string }
    | { status: 'error'; message: string }
  >({ status: 'idle' });
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [worktreeSuffix, setWorktreeSuffix] = useState<string>('');
  const [patchModal, setPatchModal] = useState<{
    open: boolean;
    worktreePath: string;
    mode: 'create' | 'update';
    patchId?: string;
    patchTitle?: string;
  } | null>(null);
  const [patchDiffModal, setPatchDiffModal] = useState<{ patch: PatchRef } | null>(null);
  const [removeWorktreeConfirm, setRemoveWorktreeConfirm] = useState<WorktreeInfo | null>(null);
  const [worktreeHasChanges, setWorktreeHasChanges] = useState(false);
  const [existingWorktrees, setExistingWorktrees] = useState<WorktreeInfo[]>([]);
  const { width: sidebarWidthState, dividerProps: sidebarDividerProps } = useResizableDivider({
    initial: sidebarWidthProp ?? 210,
    min: 140,
    max: 480,
    multiplier: -1,
    onResize: onSidebarWidthChange,
  });
  const sidebarWidth = sidebarWidthProp ?? sidebarWidthState;
  const prevIssueId = useRef<string | null>(null);
  if (issue?.id !== prevIssueId.current) {
    prevIssueId.current = issue?.id ?? null;
    if (editing) setEditing(false);
    if (worktreeState.status !== 'idle') setWorktreeState({ status: 'idle' });
  }

  function refresh() {
    actionsOnRefresh();
  }

  useEffect(() => {
    if (!issue || issue.comments !== null) return;
    setCommentsLoading(true);
    invoke<import('../../types/radboard').RawIssueData | null>('get_issue', { rid: issue.rid, issueId: issue.id })
      .then((raw) => {
        if (!raw) return;
        onCommentsLoaded(issue.id, raw.comments.map((c) => mapRawComment(c)));
      })
      .finally(() => setCommentsLoading(false));
  }, [issue?.id, issue?.comments === null]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitComment() {
    if (!issue || !commentBody.trim()) return;
    setSubmitting(true);
    try {
      await invoke('add_comment', {
        rid: issue.rid,
        issueId: issue.id,
        body: commentBody.trim(),
      });
      setCommentBody('');
      actionsOnRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDescReact(emoji: string) {
    if (!issue) return;
    setDescPickerOpen(false);
    try {
      // React to the root/description comment — we use the issue id as comment_id
      // The root comment id equals the issue id in Radicle's COB model
      await invoke('react_comment', {
        rid: issue.rid,
        issueId: issue.id,
        commentId: issue.rootId,
        emoji,
        active: true,
      });
      actionsOnRefresh();
    } catch (e) {
      console.error(e);
    }
  }

  function startEdit() {
    if (!issue) return;
    setEditTitle(issue.title);
    setEditDesc(issue.description);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  async function saveEdit() {
    if (!issue || !editTitle.trim()) return;
    setSavingEdit(true);
    try {
      await invoke('edit_issue', {
        rid: issue.rid,
        issueId: issue.id,
        title: editTitle.trim(),
        description: editDesc,
      });
      setEditing(false);
      actionsOnRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setSavingEdit(false);
    }
  }

  async function loadWorktrees() {
    if (!localRepoPath || !issue) return;
    try {
      const all = await invoke<WorktreeInfo[]>('list_worktrees', { localPath: localRepoPath });
      const prefix = issue.id.slice(0, 7);
      setExistingWorktrees(all.filter((w) => w.branch.includes(prefix)));
    } catch {
      setExistingWorktrees([]);
    }
  }

  useEffect(() => {
    loadWorktrees();
  }, [issue?.id, localRepoPath]); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirmRemoveWorktree(w: WorktreeInfo) {
    // Check for uncommitted changes before showing confirm
    try {
      const files = await invoke<{ path: string; status: string }[]>('get_worktree_status', { worktreePath: w.path });
      setWorktreeHasChanges(files.length > 0);
    } catch {
      setWorktreeHasChanges(false);
    }
    setRemoveWorktreeConfirm(w);
  }

  async function handleRemoveWorktree() {
    if (!removeWorktreeConfirm || !localRepoPath) return;
    try {
      await invoke('remove_worktree', { localPath: localRepoPath, worktreePath: removeWorktreeConfirm.path });
      setRemoveWorktreeConfirm(null);
      loadWorktrees();
    } catch (e) {
      console.error(e);
      setRemoveWorktreeConfirm(null);
    }
  }

  async function handleOpenBranchPicker() {
    if (!localRepoPath) return;
    try {
      const [branchList, currentBranch] = await Promise.all([
        invoke<string[]>('list_branches', { localPath: localRepoPath }),
        invoke<string>('get_current_branch', { localPath: localRepoPath }),
      ]);
      setBranches(branchList);
      setCurrentBranch(currentBranch);
      setSelectedBranch(currentBranch);
      setWorktreeSuffix('');
      setWorktreeState({ status: 'picking-branch' });
    } catch (e) {
      setWorktreeState({ status: 'error', message: String(e) });
    }
  }

  function computeBranchName() {
    const base = worktreeBranchName(issue?.id.slice(0, 7) ?? '', localRepoPath);
    return worktreeSuffix ? `${base}-${worktreeSuffix}` : base;
  }

  const pendingBranchName = worktreeState.status === 'picking-branch' ? computeBranchName() : '';
  const branchConflict = pendingBranchName && (
    branches.includes(pendingBranchName) ||
    existingWorktrees.some((w) => w.branch === pendingBranchName)
  );

  async function handleCreateWorktree() {
    if (!issue || !localRepoPath) return;
    setWorktreeState({ status: 'creating' });
    try {
      const path = await invoke<string>('create_patch_worktree', {
        localPath: localRepoPath,
        branchName: computeBranchName(),
        sourceBranch: selectedBranch || null,
      });
      setWorktreeState({ status: 'done', path });
      await loadWorktrees();
    } catch (e) {
      setWorktreeState({ status: 'error', message: String(e) });
    }
  }

  async function handleOpenWorktree(path: string) {
    if (!preferredEditor) return;
    try {
      await invoke('open_in_editor', { editor: preferredEditor, path });
    } catch (e) {
      console.error('Failed to open editor:', e);
    }
  }

  return (
    <>
      {!embedded && (
        <div
          className={`${styles.backdrop} ${issue ? styles.backdropVisible : ''}`}
          onClick={onClose}
        />
      )}
      <aside className={embedded ? styles.panelEmbedded : `${styles.panel} ${issue ? styles.panelOpen : ''}`}>
        {issue && (
          <>
            <header className={styles.header}>
              <span
                className={`${styles.issueId} ${issueUrl(issue.rid, issue.id) ? styles.externalLink : ''}`}
                onClick={() => { const u = issueUrl(issue.rid, issue.id); if (u) openUrl(u); }}
                title={issueUrl(issue.rid, issue.id) ? 'Open in Radicle Explorer' : undefined}
              >
                <span className={styles.idDot} />
                {issue.id.slice(0, 8)}…
              </span>
              <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
                ✕
              </button>
            </header>

            <div className={styles.body}>
              <div className={styles.mainCol}>
              <div className={styles.titleRow}>
                {editing ? (
                  <input
                    className={styles.titleInput}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    autoFocus
                  />
                ) : (
                  <h2 className={styles.title}>{issue.title}</h2>
                )}
                {(isAuthor || isDelegate) && !editing && (
                  <button className={styles.editBtn} onClick={startEdit}>edit</button>
                )}
              </div>

              <section className={styles.section}>
                <div className={styles.sectionLabel}>Description</div>
                {editing ? (
                  <>
                    <Textarea
                      className={styles.commentInput}
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      rows={6}
                      placeholder="Issue description…"
                    />
                    <div className={styles.formActions}>
                      <Button size="sm" onClick={cancelEdit}>cancel</Button>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={saveEdit}
                        disabled={savingEdit || !editTitle.trim()}
                      >
                        {savingEdit ? '…' : 'save'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    {issue.description ? (
                      <MarkdownBody content={issue.description} />
                    ) : (
                      <div className={styles.empty}>no description</div>
                    )}
                    <div className={styles.commentActions}>
                      <ReactionBar
                        reactions={issue.reactions}
                        onReact={handleDescReact}
                        onPickerOpen={() => setDescPickerOpen(true)}
                      />
                      {descPickerOpen && (
                        <EmojiPicker
                          onSelect={handleDescReact}
                          onClose={() => setDescPickerOpen(false)}
                        />
                      )}
                    </div>
                  </>
                )}
              </section>

              <section className={styles.section}>
                <div className={styles.sectionLabel}>
                  Comments
                  {(issue.comments?.length ?? 0) > 0 && (
                    <span className={styles.commentCount}>{issue.comments!.length}</span>
                  )}
                </div>

                {commentsLoading ? (
                  <div className={styles.empty}>loading…</div>
                ) : issue.comments === null ? (
                  <div className={styles.empty}>loading…</div>
                ) : issue.comments.length === 0 ? (
                  <div className={styles.empty}>no comments yet</div>
                ) : (
                  <div className={styles.comments}>
                    {issue.comments.map((c) => (
                      <CommentThread
                        key={c.id}
                        comment={c}
                        issueId={issue.id}
                        onRefresh={refresh}
                      />
                    ))}
                  </div>
                )}

                <div className={styles.newComment}>
                  <Textarea
                    className={styles.commentInput}
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="Add a comment…"
                    rows={3}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitComment();
                    }}
                  />
                  <div className={styles.formActions}>
                    <span className={styles.hint}>⌘↵ to submit</span>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={submitComment}
                      disabled={submitting || !commentBody.trim()}
                    >
                      {submitting ? '…' : 'comment'}
                    </Button>
                  </div>
                </div>
              </section>
              </div>
              <div className={styles.sidebarDivider} {...sidebarDividerProps} />
              <aside className={styles.patchSidebar} style={{ width: sidebarWidth }}>
                <div className={styles.sidebarMeta}>
                  <StateSelector
                    currentColumnId={currentColumnId ?? (issue.status === 'closed' || issue.status === 'solved' ? 'closed' : 'open')}
                    canEdit={isAuthor || isDelegate}
                    onSelect={(colId) => issue && onStateChange(issue.id, colId)}
                    solvedHint={issue.status === 'solved'}
                  />

                  {issue.status === 'open' && (
                    <div className={styles.sidebarField}>
                      <span className={styles.sidebarFieldLabel}>priority</span>
                      <PrioritySelector
                        current={issue.priority}
                        canEdit={isAuthor || isDelegate}
                        onSelect={(p) => onPriorityChange(issue.id, p)}
                      />
                    </div>
                  )}

                  <div className={styles.sidebarField}>
                    <span className={styles.sidebarFieldLabel}>author</span>
                    <span
                      className={`${styles.sidebarFieldValue} ${userUrl(issue.authorDid) ? styles.externalLink : ''}`}
                      onClick={() => { const u = userUrl(issue.authorDid); if (u) openUrl(u); }}
                      title={userUrl(issue.authorDid) ? `Open ${issue.author} in Radicle Explorer` : undefined}
                    >
                      <span className={styles.at}>@</span>{issue.author}
                    </span>
                    {canBanUser(issue.authorDid) && (
                      <button
                        className={styles.banBtn}
                        onClick={() => onBanUser(issue.authorDid, issue.author, 'all')}
                        title="Ban user"
                      >⊘</button>
                    )}
                  </div>

                  <div className={styles.sidebarField}>
                    <span className={styles.sidebarFieldLabel}>created</span>
                    <span className={styles.sidebarFieldValue}>{issue.createdAt}</span>
                  </div>

                  {issue.closedAt && (
                    <div className={styles.sidebarField}>
                      <span className={styles.sidebarFieldLabel}>closed</span>
                      <span className={styles.sidebarFieldValue}>{issue.closedAt}</span>
                    </div>
                  )}

                  <div className={styles.sidebarField}>
                    <span className={styles.sidebarFieldLabel}>repo</span>
                    <span className={`${styles.sidebarFieldValue} ${styles.sidebarRid}`} title={issue.rid}>{issue.rid}</span>
                  </div>

                  <div className={styles.sidebarField}>
                    <span className={styles.sidebarFieldLabel}>labels</span>
                    {isDelegate ? (
                      <LabelEditor
                        labels={issue.labels.map((l) => l.text)}
                        onChange={async (newLabels) => {
                          try {
                            await invoke('label_issue', { rid: issue.rid, issueId: issue.id, labels: newLabels });
                            actionsOnRefresh();
                          } catch (e) {
                            console.error(e);
                          }
                        }}
                      />
                    ) : issue.labels.length > 0 ? (
                      <div className={styles.labelEditor}>
                        {issue.labels.map((l) => (
                          <span key={l.text} className={styles.labelChip}>{l.text}</span>
                        ))}
                      </div>
                    ) : (
                      <span className={`${styles.sidebarFieldValue} ${styles.sidebarEmpty}`}>none</span>
                    )}
                  </div>

                  <div className={styles.sidebarField}>
                    <span className={styles.sidebarFieldLabel}>milestone</span>
                    <MilestonePicker
                      current={issue.milestones ?? []}
                      suggestions={milestoneSuggestions}
                      readOnly={!isDelegate && !isAuthor}
                      onChange={async (newMilestones) => {
                        try {
                          const otherLabels = issue.labels.map((l) => l.text);
                          const msLabels = newMilestones.map((ms) => `${milestonePrefix}${ms}`);
                          await invoke('label_issue', { rid: issue.rid, issueId: issue.id, labels: [...otherLabels, ...msLabels] });
                          actionsOnRefresh();
                        } catch (e) {
                          console.error(e);
                        }
                      }}
                    />
                  </div>
                </div>

                {issue.patches && issue.patches.length > 0 && (
                  <>
                    <div className={styles.patchSidebarLabel}>
                      Patches
                      <span className={styles.commentCount}>{issue.patches.length}</span>
                    </div>
                    <div className={styles.worktreeList}>
                      {issue.patches.map((p) => (
                        <div key={p.id} className={styles.worktreeRow}>
                          <Badge size="sm" variant={p.state}>{p.state}</Badge>
                          <span
                            className={`${styles.worktreeBranch} ${patchUrl(issue.rid, p.id) ? styles.worktreeBranchClickable : ''}`}
                            onClick={() => { const u = patchUrl(issue.rid, p.id); if (u) openUrl(u); }}
                            title={patchUrl(issue.rid, p.id) ? 'Open in Radicle Explorer' : undefined}
                          >
                            {p.title}
                          </span>
                          <button
                            className={styles.worktreePatchBtn}
                            onClick={() => onOpenPatch(p, issue.id)}
                            title="View patch"
                          >
                            show
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {localRepoPath && (
                  <div className={styles.worktreeSection}>
                    <div className={styles.patchSidebarLabel}>Worktrees</div>

                    {existingWorktrees.length > 0 && (
                      <div className={styles.worktreeList}>
                        {(() => {
                          const openPatch = issue.patches?.find((p) => p.state === 'open' || p.state === 'draft');
                          const mode = openPatch ? 'update' : 'create';
                          return existingWorktrees.map((w) => (
                            <div
                              key={w.path}
                              className={styles.worktreeRow}
                              title={w.path}
                            >
                              <span className={styles.worktreeBranch}>{w.branch}</span>
                              <span className={styles.worktreeHead}>{w.head.slice(0, 7)}</span>
                              {preferredEditor && (
                                <button
                                  className={styles.worktreePatchBtn}
                                  onClick={() => handleOpenWorktree(w.path)}
                                  title={`Open in ${preferredEditor}`}
                                >
                                  Open in editor
                                </button>
                              )}
                              <button
                                className={styles.worktreePatchBtn}
                                onClick={() => setPatchModal({
                                  open: true,
                                  worktreePath: w.path,
                                  mode,
                                  patchId: openPatch?.id,
                                  patchTitle: openPatch?.title,
                                })}
                                title={mode === 'create' ? 'Create patch from worktree' : 'Update patch from worktree'}
                              >
                                {mode === 'create' ? '⎇ patch' : '⎇ update'}
                              </button>
                              <button
                                className={`${styles.worktreePatchBtn} ${styles.removeWorktreeBtn}`}
                                onClick={() => confirmRemoveWorktree(w)}
                                title="Remove this worktree"
                              >
                                ✕
                              </button>
                            </div>
                          ));
                        })()}
                      </div>
                    )}

                    {worktreeState.status === 'idle' && (
                      <button className={styles.worktreeBtn} onClick={handleOpenBranchPicker}>
                        + Create worktree
                      </button>
                    )}
                    {worktreeState.status === 'picking-branch' && (
                      <div className={styles.branchPicker}>
                        <label className={styles.branchPickerLabel}>Source branch</label>
                        <GitBranchPicker
                          branches={branches}
                          currentBranch={currentBranch}
                          selected={selectedBranch}
                          onSelect={setSelectedBranch}
                        />
                        <label className={styles.branchPickerLabel}>Suffix (optional)</label>
                        <input
                          className={styles.suffixInput}
                          type="text"
                          placeholder="e.g. v2, fix, alt"
                          value={worktreeSuffix}
                          onChange={(e) => setWorktreeSuffix(e.target.value.replace(/\s+/g, '-'))}
                        />
                        <div className={styles.branchPreview} title={pendingBranchName}>
                          ⎇ {pendingBranchName}
                        </div>
                        {branchConflict && (
                          <div className={styles.branchConflict}>
                            Branch "{pendingBranchName}" already exists — add a suffix
                          </div>
                        )}
                        <div className={styles.branchPickerActions}>
                          <button
                            className={styles.worktreeBtn}
                            onClick={handleCreateWorktree}
                            disabled={!!branchConflict}
                          >
                            Create
                          </button>
                          <button
                            className={styles.branchPickerCancel}
                            onClick={() => setWorktreeState({ status: 'idle' })}
                          >
                            cancel
                          </button>
                        </div>
                      </div>
                    )}
                    {worktreeState.status === 'creating' && (
                      <span className={styles.worktreeHint}>creating…</span>
                    )}
                    {worktreeState.status === 'done' && (
                      <div className={styles.worktreeDone}>
                        <div className={styles.worktreePath}>{worktreeState.path}</div>
                        <code className={styles.worktreeCmd}>
                          {`cd ${worktreeState.path} && rad patch open --title "${issue.title}"`}
                        </code>
                        <button className={styles.worktreeCopy}
                          onClick={() => navigator.clipboard.writeText(
                            `cd ${worktreeState.path} && rad patch open --title "${issue.title}"`
                          ).catch(console.error)}>
                          copy
                        </button>
                      </div>
                    )}
                    {worktreeState.status === 'error' && (
                      <div className={styles.worktreeError}>
                        {worktreeState.message}
                        <button onClick={() => setWorktreeState({ status: 'idle' })}>retry</button>
                      </div>
                    )}
                  </div>
                )}
              </aside>
            </div>
          </>
        )}
      </aside>
      {patchModal?.open && (
        <PatchFromWorktreeModal
          open={patchModal.open}
          worktreePath={patchModal.worktreePath}
          issueId={issue?.id ?? ''}
          issueTitle={issue?.title ?? ''}
          mode={patchModal.mode}
          patchId={patchModal.patchId}
          patchTitle={patchModal.patchTitle}
          onSuccess={async () => {
            setPatchModal(null);
            await loadWorktrees();
            if (issue) actionsOnRefresh();
          }}
          preferredEditor={preferredEditor}
          onClose={() => setPatchModal(null)}
        />
      )}
      {patchDiffModal && (
        <PatchDiffModal
          open={true}
          patch={patchDiffModal.patch}
          issueId={issue?.id ?? ''}
          onPatchStateChange={() => actionsOnRefresh()}
          onClose={() => setPatchDiffModal(null)}
        />
      )}
      <ConfirmDialog
        open={!!removeWorktreeConfirm}
        title="Remove worktree"
        message={
          worktreeHasChanges
            ? `"${removeWorktreeConfirm?.branch ?? ''}" has uncommitted changes that will be lost. Remove anyway?`
            : `Remove worktree "${removeWorktreeConfirm?.branch ?? ''}"?`
        }
        confirmLabel="Remove"
        onConfirm={handleRemoveWorktree}
        onCancel={() => setRemoveWorktreeConfirm(null)}
      />
    </>
  );
}
