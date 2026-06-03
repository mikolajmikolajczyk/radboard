import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FileStatus, PatchCommitEntry } from '../../types/radboard';
import { FileDiffBox, parseDiff } from './DiffView';
import type { FileDiff } from './DiffView';
import { Modal, Button, useResizableDivider } from '../../ui';
import { useRepo } from '../../contexts/RepoContext';
import CommitCard, { enrichCommit, type EnrichedCommit } from './CommitCard';
import UnstagedSection from './UnstagedSection';
import SyncWorktreeModal from '../worktrees/SyncWorktreeModal';
import {
  type ConventionalType,
  formatConventional,
} from './conventionalCommit';
import styles from './PatchFromWorktreeModal.module.css';

interface Props {
  open: boolean;
  worktreePath: string;
  issueId?: string;
  issueTitle?: string;
  mode: 'create' | 'update';
  patchId?: string;
  patchTitle?: string;
  preferredEditor?: string | null;
  onSuccess: () => void;
  onClose: () => void;
}

export default function PatchFromWorktreeModal({
  open,
  worktreePath,
  issueId,
  issueTitle,
  mode,
  patchId,
  preferredEditor,
  onSuccess,
  onClose,
}: Props) {
  const { defaultBranch = 'master' } = useRepo();

  // -- State --
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [fileDiffs, setFileDiffs] = useState<FileDiff[]>([]);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [commits, setCommits] = useState<EnrichedCommit[]>([]);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ ahead: number; behind: number; conflicts: string[] } | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [selectedCommitOid, setSelectedCommitOid] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [committedFiles, setCommittedFiles] = useState<Set<string>>(new Set());
  const [operating, setOperating] = useState(false);

  // Create-mode only: patch title & description
  const [patchTitleInput, setPatchTitleInput] = useState('');
  const [patchDesc, setPatchDesc] = useState('');

  const { width: modalWidth, dividerProps: modalResizeProps } = useResizableDivider({
    initial: Math.min(1000, Math.round(window.innerWidth * 0.92)),
    min: 600,
    max: Math.round(window.innerWidth * 0.98),
    multiplier: 2,
  });

  const { width: formColWidth, dividerProps: colResizeProps } = useResizableDivider({
    initial: 360,
    min: 260,
    max: 600,
  });

  const enrichAll = useCallback(
    (raw: PatchCommitEntry[]) => raw.map((c, i) => enrichCommit(c, i, raw.length)),
    [],
  );

  const recentTypes: ConventionalType[] = (() => {
    const seen = new Set<ConventionalType>();
    for (const c of commits) {
      if (c.type) seen.add(c.type);
    }
    return Array.from(seen);
  })();

  // -- Selection helpers: selecting a commit clears file selection and vice versa --
  function selectCommit(oid: string) {
    setSelectedCommitOid(oid);
    setSelectedFilePath(null);
  }

  function selectFile(path: string) {
    setSelectedFilePath((prev) => (prev === path ? null : path));
    setSelectedCommitOid(null);
  }

  // -- Load on open --
  useEffect(() => {
    if (!open) return;
    setError(null);
    setFileDiffs([]);
    setCommittedFiles(new Set());
    setCommits([]);
    setSelectedCommitOid(null);
    setSelectedFilePath(null);

    if (mode === 'create') {
      setPatchTitleInput(issueTitle ?? '');
      setPatchDesc('');
    }

    // Load unstaged files
    setLoadingFiles(true);
    invoke<FileStatus[]>('get_worktree_status', { worktreePath })
      .then((f) => {
        setFiles(f);
        setSelected(new Set(f.map((x) => x.path)));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingFiles(false));

    // Load existing commits — works for both create and update modes.
    // In create mode the user may already have commits on top of the base branch
    // (e.g. authored before opening this dialog); they need to appear and be usable.
    setLoadingCommits(true);
    invoke<PatchCommitEntry[]>('get_patch_commits', {
      worktreePath,
      baseBranch: defaultBranch,
    })
      .then((raw) => {
        const enriched = raw.map((c, i) => enrichCommit(c, i, raw.length));
        setCommits(enriched);
        if (enriched.length > 0) {
          setSelectedCommitOid(enriched[enriched.length - 1].oid);
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingCommits(false));

    // Sync status against the repo's default branch. Stay quiet on failure
    // (no remote / wrong base) — better than an alarming banner for a check.
    setSyncStatus(null);
    invoke<{ ahead: number; behind: number; conflicts: string[] }>('check_worktree_sync', {
      worktreePath,
      baseBranch: defaultBranch,
    })
      .then(setSyncStatus)
      .catch(() => setSyncStatus(null));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function refreshSyncStatus() {
    invoke<{ ahead: number; behind: number; conflicts: string[] }>('check_worktree_sync', {
      worktreePath,
      baseBranch: defaultBranch,
    })
      .then(setSyncStatus)
      .catch(() => setSyncStatus(null));
  }

  // -- Diff: show selected commit's diff OR selected file's diff --
  useEffect(() => {
    if (!open) return;

    if (selectedCommitOid) {
      setLoadingDiff(true);
      invoke<string>('get_commit_diff', { worktreePath, commitOid: selectedCommitOid })
        .then((raw) => setFileDiffs(parseDiff(raw)))
        .catch(() => setFileDiffs([]))
        .finally(() => setLoadingDiff(false));
      return;
    }

    if (selectedFilePath) {
      setLoadingDiff(true);
      invoke<string>('get_worktree_diff', { worktreePath, files: [selectedFilePath] })
        .then((raw) => setFileDiffs(parseDiff(raw)))
        .catch(() => setFileDiffs([]))
        .finally(() => setLoadingDiff(false));
      return;
    }

    setFileDiffs([]);
  }, [selectedCommitOid, selectedFilePath, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // -- Handlers --
  function toggleFile(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }

  async function handleTypeChange(oid: string, newType: ConventionalType) {
    const commit = commits.find((c) => c.oid === oid);
    if (!commit) return;
    const newMsg = formatConventional(newType, commit.scope, commit.description);
    await handleRewriteMessage(oid, newMsg);
  }

  async function handleRewriteMessage(oid: string, newMessage: string) {
    // Capture position BEFORE the rewrite so we know which slot to reselect.
    // Rewriting a commit also rewrites every descendant, so the original oid
    // disappears from the list — we must pick by index, never by old oid.
    const prevIdx = commits.findIndex((c) => c.oid === oid);
    setOperating(true);
    setError(null);
    try {
      const updated = await invoke<PatchCommitEntry[]>('rewrite_commit_message', {
        worktreePath,
        commitOid: oid,
        newMessage,
        baseBranch: defaultBranch,
      });
      const enriched = enrichAll(updated);
      setCommits(enriched);
      if (enriched.length === 0) {
        setSelectedCommitOid(null);
      } else if (prevIdx >= 0 && prevIdx < enriched.length) {
        setSelectedCommitOid(enriched[prevIdx].oid);
      } else {
        setSelectedCommitOid(enriched[enriched.length - 1].oid);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setOperating(false);
    }
  }

  async function handleMergeUp(oid: string) {
    const idx = commits.findIndex((c) => c.oid === oid);
    if (idx <= 0) return;
    const target = commits[idx - 1];
    const source = commits[idx];
    const combinedMsg = `${target.fullMessage}\n\n${source.fullMessage}`;

    setOperating(true);
    setError(null);
    try {
      const updated = await invoke<PatchCommitEntry[]>('squash_commits', {
        worktreePath,
        targetOid: target.oid,
        sourceOid: source.oid,
        newMessage: combinedMsg,
        baseBranch: defaultBranch,
      });
      const enriched = enrichAll(updated);
      setCommits(enriched);
      if (enriched.length === 0) {
        setSelectedCommitOid(null);
      } else if (idx - 1 < enriched.length) {
        setSelectedCommitOid(enriched[idx - 1].oid);
      } else {
        setSelectedCommitOid(enriched[enriched.length - 1].oid);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setOperating(false);
    }
  }

  async function handleUncommit() {
    setOperating(true);
    setError(null);
    try {
      await invoke('uncommit_head', { worktreePath });
      const [newCommits, newFiles] = await Promise.all([
        invoke<PatchCommitEntry[]>('get_patch_commits', {
          worktreePath,
          baseBranch: defaultBranch,
        }),
        invoke<FileStatus[]>('get_worktree_status', { worktreePath }),
      ]);
      const enriched = enrichAll(newCommits);
      setCommits(enriched);
      setFiles(newFiles);
      setSelected(new Set(newFiles.map((f) => f.path)));
      setCommittedFiles(new Set());
      if (enriched.length > 0) {
        setSelectedCommitOid(enriched[enriched.length - 1].oid);
      } else {
        setSelectedCommitOid(null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setOperating(false);
    }
  }

  async function handleCommitFiles(
    filePaths: string[],
    type: ConventionalType,
    message: string,
  ) {
    const fullMsg = formatConventional(type, null, message);
    setOperating(true);
    setError(null);
    try {
      const newEntry = await invoke<PatchCommitEntry>('commit_staged_files', {
        worktreePath,
        files: filePaths,
        commitMessage: fullMsg,
      });
      const allRaw = [
        ...commits.map((c) => ({
          oid: c.oid,
          shortOid: c.shortOid,
          summary: c.fullMessage,
          timestamp: c.timestamp,
        })),
        newEntry,
      ];
      setCommits(enrichAll(allRaw));
      setSelectedCommitOid(newEntry.oid);
      setSelectedFilePath(null);

      // Refresh unstaged files
      const newFiles = await invoke<FileStatus[]>('get_worktree_status', { worktreePath });
      setFiles(newFiles);
      setSelected(new Set(newFiles.map((f) => f.path)));
      setCommittedFiles(new Set());
    } catch (e) {
      setError(String(e));
    } finally {
      setOperating(false);
    }
  }

  async function handleDiscardFile(path: string, status: string) {
    setError(null);
    try {
      await invoke('discard_worktree_file', { worktreePath, filePath: path, status });
      // Refresh unstaged files
      const newFiles = await invoke<FileStatus[]>('get_worktree_status', { worktreePath });
      setFiles(newFiles);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      if (selectedFilePath === path) setSelectedFilePath(null);
    } catch (e) {
      setError(String(e));
    }
  }

  // -- Submit --
  async function handleSubmit() {
    if (submitting) return;
    if (commits.length === 0) return;

    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'create') {
        if (!patchTitleInput.trim()) return;
        await invoke('push_create_patch', {
          worktreePath,
          patchTitle: issueId ? `[${issueId.slice(0, 7)}] ${patchTitleInput.trim()}` : patchTitleInput.trim(),
          patchDescription: patchDesc.trim(),
        });
      } else {
        await invoke('commit_and_update_patch', {
          worktreePath,
          files: [],
          commitMessage: '',
          patchId: patchId!,
          amend: false,
        });
      }
      onSuccess();
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  }

  // -- Derived --
  const selectedShort = commits.find((c) => c.oid === selectedCommitOid)?.shortOid;
  const diffLabel = selectedCommitOid && selectedShort
    ? `Changes — ${selectedShort}`
    : selectedFilePath
      ? `Changes — ${selectedFilePath}`
      : 'Changes';
  const busy = operating || submitting;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={modalWidth}
      style={{ top: '10vh', bottom: '10vh', transform: 'translateX(-50%)', maxHeight: 'none' }}
    >
      <div className={styles.resizeHandle} {...modalResizeProps} />

      <Modal.Header onClose={onClose}>
        {mode === 'create' ? 'Create patch' : 'Update patch'}
      </Modal.Header>

      {syncStatus && (syncStatus.behind > 0 || syncStatus.conflicts.length > 0) && (
        <div className={syncStatus.conflicts.length > 0 ? styles.syncBannerError : styles.syncBannerWarn}>
          {syncStatus.conflicts.length > 0 ? (
            <>
              <div className={styles.syncBannerTitle}>
                {syncStatus.conflicts.length} file{syncStatus.conflicts.length === 1 ? '' : 's'} would conflict with <code>{defaultBranch}</code> — resolve conflicts in a terminal first
              </div>
              <ul className={styles.syncConflictList}>
                {syncStatus.conflicts.map((p) => <li key={p}><code>{p}</code></li>)}
              </ul>
              <div className={styles.syncHint}>
                Auto-sync would abort on these conflicts. Run <code>git rebase {defaultBranch}</code> (or <code>git merge {defaultBranch}</code>) in the worktree and resolve manually, then reopen this dialog.
              </div>
            </>
          ) : (
            <>
              <div className={styles.syncBannerTitle}>
                {syncStatus.behind} commit{syncStatus.behind === 1 ? '' : 's'} behind <code>{defaultBranch}</code> — recommended to sync before {mode === 'create' ? 'creating' : 'updating'} the patch
              </div>
              <Button size="sm" onClick={() => setSyncOpen(true)}>Sync</Button>
            </>
          )}
        </div>
      )}

      <div className={styles.body}>
        <div
          className={styles.columns}
          style={{ gridTemplateColumns: `${formColWidth}px 6px 1fr` }}
        >
          {/* Left column */}
          <div className={styles.formCol}>
            {/* Patch title/desc — create mode, at the top */}
            {mode === 'create' && (
              <div className={styles.patchMeta}>
                <label className={styles.label}>
                  Patch title
                  <div className={styles.titleRow}>
                    {issueId && <span className={styles.titlePrefix}>[{issueId.slice(0, 7)}]</span>}
                    <input
                      className={styles.titleInput}
                      value={patchTitleInput}
                      onChange={(e) => setPatchTitleInput(e.target.value)}
                      placeholder="patch title"
                      disabled={submitting}
                      autoFocus
                    />
                  </div>
                </label>
                <label className={styles.label}>
                  Description <span className={styles.optional}>(optional)</span>
                  <textarea
                    className={styles.textarea}
                    value={patchDesc}
                    onChange={(e) => setPatchDesc(e.target.value)}
                    placeholder="describe the patch…"
                    rows={2}
                    disabled={submitting}
                  />
                </label>
              </div>
            )}

            {/* Commits section */}
            <div className={styles.commitsSection}>
              <div className={styles.sectionLabelSmall}>Commits</div>
              {loadingCommits ? (
                <span className={styles.hint}>loading…</span>
              ) : commits.length === 0 ? (
                <span className={styles.hint}>
                  {mode === 'create'
                    ? 'Stage files below to create your first commit'
                    : 'No commits on this patch yet'}
                </span>
              ) : (
                commits.map((c) => (
                  <CommitCard
                    key={c.oid}
                    commit={c}
                    selected={c.oid === selectedCommitOid}
                    recentTypes={recentTypes}
                    disabled={busy}
                    onSelect={() => selectCommit(c.oid)}
                    onTypeChange={(t) => handleTypeChange(c.oid, t)}
                    onMessageChange={(msg) => handleRewriteMessage(c.oid, msg)}
                    onMergeUp={() => handleMergeUp(c.oid)}
                    onUncommit={handleUncommit}
                  />
                ))
              )}
            </div>

            {/* Unstaged changes */}
            <div className={styles.unstagedSection}>
              {loadingFiles ? (
                <span className={styles.hint}>loading…</span>
              ) : files.length === 0 ? (
                <span className={styles.hint}>No unstaged changes</span>
              ) : (
                <UnstagedSection
                  files={files}
                  selected={selected}
                  committedFiles={committedFiles}
                  disabled={busy}
                  recentTypes={recentTypes}
                  selectedFilePath={selectedFilePath}
                  onToggleFile={toggleFile}
                  onSelectAll={() => setSelected(new Set(files.map((f) => f.path)))}
                  onDeselectAll={() => setSelected(new Set())}
                  onSelectFile={selectFile}
                  onCommitFiles={handleCommitFiles}
                  onDiscardFile={handleDiscardFile}
                />
              )}
            </div>

            {error && <div className={styles.error}>{error}</div>}
          </div>

          {/* Column resize handle */}
          <div className={styles.colResizeHandle} {...colResizeProps} />

          {/* Right column: diff */}
          <div className={styles.diffCol}>
            <div className={styles.sectionLabel}>
              {diffLabel}
              {loadingDiff && <span className={styles.hint}> loading…</span>}
            </div>
            <div className={styles.diffScroll}>
              {fileDiffs.length === 0 && !loadingDiff ? (
                <span className={styles.hint}>Select a commit or file to view changes</span>
              ) : (
                fileDiffs.map((fd) => (
                  <FileDiffBox
                    key={fd.path}
                    file={fd}
                    basePath={worktreePath}
                    preferredEditor={preferredEditor}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal.Footer>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={
            commits.length === 0 ||
            (mode === 'create' && !patchTitleInput.trim()) ||
            busy ||
            loadingCommits ||
            (syncStatus?.conflicts.length ?? 0) > 0
          }
          title={(syncStatus?.conflicts.length ?? 0) > 0 ? 'Resolve conflicts with base branch first' : undefined}
        >
          {submitting
            ? mode === 'create' ? 'Creating…' : 'Updating…'
            : mode === 'create' ? 'Create patch' : 'Update patch'}
        </Button>
      </Modal.Footer>
      {syncOpen && (
        <SyncWorktreeModal
          open
          worktreePath={worktreePath}
          worktreeBranch={defaultBranch}
          onClose={() => { setSyncOpen(false); refreshSyncStatus(); }}
          onSuccess={() => {
            refreshSyncStatus();
            // Reload commits — rebase rewrites oids, merge adds a commit.
            invoke<PatchCommitEntry[]>('get_patch_commits', { worktreePath, baseBranch: defaultBranch })
              .then((raw) => {
                const enriched = raw.map((c, i) => enrichCommit(c, i, raw.length));
                setCommits(enriched);
                if (enriched.length > 0) setSelectedCommitOid(enriched[enriched.length - 1].oid);
              })
              .catch((e) => setError(String(e)));
          }}
        />
      )}
    </Modal>
  );
}
