import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import ConfirmDialog from '../shared/ConfirmDialog';
import PatchFromWorktreeModal from '../patches/PatchFromWorktreeModal';
import SyncWorktreeModal from './SyncWorktreeModal';
import { Button } from '../../ui';
import type { WorktreeInfo, FileStatus } from '../../types/radboard';
import styles from './WorktreesView.module.css';

interface Props {
  localRepoPath: string | null;
  preferredEditor: string | null;
  onFindIssue?: (prefix: string) => { id: string; title: string } | null;
  onOpenIssue?: (issueId: string) => void;
  onFindPatches?: (prefix: string, head: string) => { id: string; title: string; state: string; head: string }[];
  onOpenPatch?: (patchId: string) => void;
}

function extractIssuePrefix(branch: string): string | null {
  const m = branch.match(/[0-9a-f]{7}/i);
  return m ? m[0].toLowerCase() : null;
}

const PATCH_STATE_COLORS: Record<string, string> = {
  open: '#5de4c7',
  draft: '#888',
  merged: '#c084fc',
  archived: '#f87171',
};

export default function WorktreesView({ localRepoPath, preferredEditor, onFindIssue, onOpenIssue, onFindPatches, onOpenPatch }: Props) {
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<WorktreeInfo | null>(null);
  const [dirtyWarning, setDirtyWarning] = useState(false);
  const [confirmUpdate, setConfirmUpdate] = useState<{ wt: WorktreeInfo; commitOid: string } | null>(null);
  const [dirtyUpdateWarning, setDirtyUpdateWarning] = useState(false);
  const [patchModal, setPatchModal] = useState<{
    worktreePath: string;
    mode: 'create' | 'update';
    issueId?: string;
    issueTitle?: string;
    patchId?: string;
    patchTitle?: string;
  } | null>(null);
  const [syncModal, setSyncModal] = useState<{ path: string; branch: string } | null>(null);

  const refresh = useCallback(() => {
    if (!localRepoPath) return;
    setLoading(true);
    invoke<WorktreeInfo[]>('list_worktrees', { localPath: localRepoPath })
      .then(setWorktrees)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [localRepoPath]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleRemoveClick(wt: WorktreeInfo) {
    try {
      const status = await invoke<FileStatus[]>('get_worktree_status', { worktreePath: wt.path });
      setDirtyWarning(status.length > 0);
    } catch {
      setDirtyWarning(false);
    }
    setConfirmRemove(wt);
  }

  async function confirmRemoveWorktree() {
    if (!confirmRemove || !localRepoPath) return;
    try {
      await invoke('remove_worktree', { localPath: localRepoPath, worktreePath: confirmRemove.path });
      refresh();
    } catch (e) {
      console.error(e);
    }
    setConfirmRemove(null);
    setDirtyWarning(false);
  }

  async function handleUpdateClick(wt: WorktreeInfo, commitOid: string) {
    try {
      const status = await invoke<FileStatus[]>('get_worktree_status', { worktreePath: wt.path });
      setDirtyUpdateWarning(status.length > 0);
    } catch {
      setDirtyUpdateWarning(false);
    }
    setConfirmUpdate({ wt, commitOid });
  }

  async function confirmUpdateWorktree() {
    if (!confirmUpdate) return;
    try {
      await invoke('update_worktree', {
        worktreePath: confirmUpdate.wt.path,
        commitOid: confirmUpdate.commitOid,
      });
      refresh();
    } catch (e) {
      console.error(e);
    }
    setConfirmUpdate(null);
    setDirtyUpdateWarning(false);
  }

  function openInEditor(path: string) {
    if (!preferredEditor) return;
    invoke('open_in_editor', { editor: preferredEditor, path }).catch(console.error);
  }

  if (!localRepoPath) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>No local repo path configured. Set it in Settings.</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.count}>{worktrees.length} worktree{worktrees.length !== 1 ? 's' : ''}</span>
        <Button size="sm" onClick={refresh} disabled={loading}>Refresh</Button>
      </div>

      {worktrees.length === 0 ? (
        <div className={styles.empty}>{loading ? 'Loading...' : 'No worktrees found'}</div>
      ) : (
        <div className={styles.list}>
          <div className={styles.colHeader}>
            <span className={styles.branch}>Branch</span>
            <span className={styles.head}>Commit</span>
            <span className={styles.issue}>Issue</span>
            <span className={styles.patch}>Patch</span>
            <span className={styles.path}>Path</span>
          </div>
          {worktrees.map((wt) => {
            const prefix = extractIssuePrefix(wt.branch);
            const issue = prefix && onFindIssue ? onFindIssue(prefix) : null;
            const patches = prefix && onFindPatches ? onFindPatches(prefix, wt.head) : [];
            const outdatedPatch = patches.find((p) => p.head !== wt.head);
            const openPatch = patches.find((p) => p.state === 'open' || p.state === 'draft');
            const patchMode = openPatch ? 'update' : 'create';
            return (
              <div key={wt.path} className={styles.row}>
                <span className={styles.branch}>{wt.branch || '(detached)'}</span>
                <span className={styles.head}>{wt.head.slice(0, 7)}</span>
                <span className={styles.issue}>
                  {issue ? (
                    <button className={styles.issueLink} onClick={() => onOpenIssue?.(issue.id)} title={issue.title}>
                      <span className={styles.issuePrefix}>{prefix}</span>
                      <span className={styles.issueTitle}>{issue.title}</span>
                    </button>
                  ) : prefix ? (
                    <span className={styles.issuePrefixMuted}>{prefix}</span>
                  ) : null}
                </span>
                <span className={styles.patch}>
                  {patches.map((p) => (
                    <button key={p.id} className={styles.issueLink} onClick={() => onOpenPatch?.(p.id)} title={p.title}>
                      <span className={styles.patchState} style={{ color: PATCH_STATE_COLORS[p.state] ?? '#888' }}>
                        {p.state}
                      </span>
                      <span className={styles.issueTitle}>{p.title}</span>
                      {p.head !== wt.head && (
                        <span
                          className={styles.outdatedBadge}
                          title={`Worktree is at ${wt.head.slice(0, 7)}, patch is at ${p.head.slice(0, 7)}`}
                        >
                          outdated
                        </span>
                      )}
                    </button>
                  ))}
                </span>
                <span className={styles.path}>{wt.path}</span>
                <div className={styles.actions}>
                  {preferredEditor && (
                    <Button size="sm" onClick={() => openInEditor(wt.path)} title="Open in editor">
                      Open
                    </Button>
                  )}
                  {outdatedPatch && (
                    <Button
                      size="sm"
                      onClick={() => handleUpdateClick(wt, outdatedPatch.head)}
                      title="Update worktree to latest patch revision"
                    >
                      Update
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => setPatchModal({
                      worktreePath: wt.path,
                      mode: patchMode,
                      issueId: issue?.id,
                      issueTitle: issue?.title,
                      patchId: openPatch?.id,
                      patchTitle: openPatch?.title,
                    })}
                    title={patchMode === 'create' ? 'Create patch from worktree' : 'Update patch from worktree'}
                  >
                    {patchMode === 'create' ? '⎇ patch' : '⎇ update'}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setSyncModal({ path: wt.path, branch: wt.branch })}
                    title="Sync worktree with a base branch (rebase / merge)"
                  >
                    Sync
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => handleRemoveClick(wt)} title="Remove worktree">
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirmRemove !== null}
        title="Remove worktree"
        message={dirtyWarning
          ? `This worktree has uncommitted changes. Remove "${confirmRemove?.branch}" anyway?`
          : `Remove worktree "${confirmRemove?.branch}"?`}
        confirmLabel="Remove"
        onConfirm={confirmRemoveWorktree}
        onCancel={() => { setConfirmRemove(null); setDirtyWarning(false); }}
      />
      <ConfirmDialog
        open={confirmUpdate !== null}
        title="Update worktree"
        message={dirtyUpdateWarning
          ? `This worktree has uncommitted changes. Update "${confirmUpdate?.wt.branch}" to latest revision anyway?`
          : `Update worktree "${confirmUpdate?.wt.branch}" to latest patch revision?`}
        confirmLabel="Update"
        onConfirm={confirmUpdateWorktree}
        onCancel={() => { setConfirmUpdate(null); setDirtyUpdateWarning(false); }}
      />
      {syncModal && (
        <SyncWorktreeModal
          open
          worktreePath={syncModal.path}
          worktreeBranch={syncModal.branch}
          onClose={() => setSyncModal(null)}
          onSuccess={() => refresh()}
        />
      )}
      {patchModal && (
        <PatchFromWorktreeModal
          open
          worktreePath={patchModal.worktreePath}
          issueId={patchModal.issueId}
          issueTitle={patchModal.issueTitle}
          mode={patchModal.mode}
          patchId={patchModal.patchId}
          patchTitle={patchModal.patchTitle}
          preferredEditor={preferredEditor}
          onSuccess={() => {
            setPatchModal(null);
            refresh();
          }}
          onClose={() => setPatchModal(null)}
        />
      )}
    </div>
  );
}
