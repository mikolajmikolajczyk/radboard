import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FileStatus } from '../../types/radboard';
import { FileDiffBox, parseDiff } from './DiffView';
import type { FileDiff } from './DiffView';
import { Modal, Button, useResizableDivider } from '../../ui';
import styles from './PatchFromWorktreeModal.module.css';

interface Props {
  open: boolean;
  worktreePath: string;
  issueId: string;
  issueTitle: string;
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
  patchTitle,
  preferredEditor,
  onSuccess,
  onClose,
}: Props) {
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [fileDiffs, setFileDiffs] = useState<FileDiff[]>([]);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [patchTitleInput, setPatchTitleInput] = useState('');
  const [patchDesc, setPatchDesc] = useState('');
  const [amend, setAmend] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const diffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { width: modalWidth, dividerProps: modalResizeProps } = useResizableDivider({
    initial: Math.min(1000, Math.round(window.innerWidth * 0.92)),
    min: 600,
    max: Math.round(window.innerWidth * 0.98),
    multiplier: 2,
  });

  const { width: formColWidth, dividerProps: colResizeProps } = useResizableDivider({
    initial: 320,
    min: 220,
    max: 600,
  });

  useEffect(() => {
    if (!open) return;
    setPatchTitleInput(issueTitle);
    setCommitMessage(`[${issueId.slice(0, 7)}] ${issueTitle}`);
    setPatchDesc('');
    setError(null);
    setFileDiffs([]);
    setAmend(false);
    setLoadingFiles(true);
    invoke<FileStatus[]>('get_worktree_status', { worktreePath })
      .then((f) => {
        setFiles(f);
        setSelected(new Set(f.map((x) => x.path)));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingFiles(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    if (diffTimer.current) clearTimeout(diffTimer.current);
    diffTimer.current = setTimeout(() => {
      if (selected.size === 0) {
        setFileDiffs([]);
        return;
      }
      setLoadingDiff(true);
      invoke<string>('get_worktree_diff', { worktreePath, files: Array.from(selected) })
        .then((raw) => setFileDiffs(parseDiff(raw)))
        .catch(() => setFileDiffs([]))
        .finally(() => setLoadingDiff(false));
    }, 150);
    return () => {
      if (diffTimer.current) clearTimeout(diffTimer.current);
    };
  }, [selected, open]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleFile(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }

  async function handleToggleAmend(enable: boolean) {
    setAmend(enable);
    if (enable) {
      try {
        const msg = await invoke<string>('get_head_commit_message', { worktreePath });
        if (msg) setCommitMessage(msg);
      } catch {
        // ignore — user can type message manually
      }
    } else {
      setCommitMessage(`[${issueId.slice(0, 7)}] ${issueTitle}`);
    }
  }

  async function handleSubmit() {
    if (mode === 'create' && selected.size === 0) return;
    if (!commitMessage.trim() || submitting) return;
    if (mode === 'create' && !patchTitleInput.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'create') {
        await invoke('commit_and_create_patch', {
          worktreePath,
          files: Array.from(selected),
          commitMessage: commitMessage.trim(),
          patchTitle: `[${issueId.slice(0, 7)}] ${patchTitleInput.trim()}`,
          patchDescription: patchDesc.trim(),
        });
      } else {
        await invoke('commit_and_update_patch', {
          worktreePath,
          files: Array.from(selected),
          commitMessage: commitMessage.trim(),
          patchId: patchId!,
          amend,
        });
      }
      onSuccess();
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  }

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

      <div className={styles.body}>
        <div
          className={styles.columns}
          style={{ gridTemplateColumns: `${formColWidth}px 6px 1fr` }}
        >
          {/* Left column: form */}
          <div className={styles.formCol}>
            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                Changed files
                <button
                  className={styles.selectAll}
                  onClick={() =>
                    setSelected(
                      selected.size === files.length
                        ? new Set()
                        : new Set(files.map((f) => f.path))
                    )
                  }
                >
                  {selected.size === files.length ? 'deselect all' : 'select all'}
                </button>
              </div>
              {loadingFiles ? (
                <span className={styles.hint}>loading…</span>
              ) : files.length === 0 ? (
                <span className={styles.hint}>
                  {mode === 'update'
                    ? 'No new changes — will push existing commits'
                    : 'No changes in worktree'}
                </span>
              ) : (
                <div className={styles.fileList}>
                  {files.map((f) => (
                    <label key={f.path} className={styles.fileRow}>
                      <input
                        type="checkbox"
                        checked={selected.has(f.path)}
                        onChange={() => toggleFile(f.path)}
                        disabled={submitting}
                      />
                      <code className={styles.fileStatus}>{f.status.trim() || '??'}</code>
                      <span className={styles.filePath}>{f.path}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <label className={styles.label}>
              Commit message
              <input
                className={styles.input}
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="describe the change…"
                disabled={submitting}
                autoFocus
              />
            </label>

            {mode === 'create' && (
              <>
                <label className={styles.label}>
                  Patch title
                  <div className={styles.titleRow}>
                    <span className={styles.titlePrefix}>[{issueId.slice(0, 7)}]</span>
                    <input
                      className={styles.titleInput}
                      value={patchTitleInput}
                      onChange={(e) => {
                        setPatchTitleInput(e.target.value);
                        if (!commitMessage.trim()) {
                          setCommitMessage(`[${issueId.slice(0, 7)}] ${e.target.value}`);
                        }
                      }}
                      placeholder="patch title"
                      disabled={submitting}
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
                    rows={3}
                    disabled={submitting}
                  />
                </label>
              </>
            )}

            {mode === 'update' && (
              <div className={styles.amendRow}>
                <label className={styles.amendToggle}>
                  <input
                    type="checkbox"
                    checked={amend}
                    onChange={(e) => handleToggleAmend(e.target.checked)}
                    disabled={submitting}
                  />
                  Amend last commit
                </label>
                {patchTitle && (
                  <span className={styles.updatePatchTitle}>{patchTitle}</span>
                )}
              </div>
            )}

            {error && <div className={styles.error}>{error}</div>}
          </div>

          {/* Column resize handle */}
          <div className={styles.colResizeHandle} {...colResizeProps} />

          {/* Right column: diff */}
          <div className={styles.diffCol}>
            <div className={styles.sectionLabel}>
              Changes
              {loadingDiff && <span className={styles.hint}> loading…</span>}
            </div>
            <div className={styles.diffScroll}>
              {fileDiffs.length === 0 && !loadingDiff ? (
                <span className={styles.hint}>No tracked changes to display</span>
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
            (mode === 'create' && selected.size === 0) ||
            !commitMessage.trim() ||
            (mode === 'create' && !patchTitleInput.trim()) ||
            submitting ||
            loadingFiles
          }
        >
          {submitting
            ? mode === 'create'
              ? 'Creating…'
              : amend
                ? 'Amending…'
                : 'Updating…'
            : mode === 'create'
              ? 'Create patch'
              : amend
                ? 'Amend & update patch'
                : 'Update patch'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
