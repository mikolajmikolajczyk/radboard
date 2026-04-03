import { useState, useRef } from 'react';
import { CommitTypePicker } from './CommitTypePicker';
import ConfirmDialog from '../shared/ConfirmDialog';
import type { ConventionalType } from './conventionalCommit';
import type { FileStatus } from '../../types/radboard';
import styles from './UnstagedSection.module.css';

interface Props {
  files: FileStatus[];
  selected: Set<string>;
  committedFiles: Set<string>;
  disabled: boolean;
  recentTypes: ConventionalType[];
  selectedFilePath: string | null;
  onToggleFile: (path: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onSelectFile: (path: string) => void;
  onCommitFiles: (files: string[], type: ConventionalType, message: string) => void;
  onDiscardFile: (path: string, status: string) => void;
}

function statusClass(raw: string): string {
  const s = raw.trim();
  if (s === 'D') return styles.statusD;
  if (s === 'A' || s === '??') return styles.statusA;
  if (s === 'M' || s === 'MM') return styles.statusM;
  return styles.statusOther;
}

function statusLabel(raw: string): string {
  const s = raw.trim();
  if (s === '??') return 'A';
  if (s.length >= 1) return s[0];
  return '?';
}

export default function UnstagedSection({
  files,
  selected,
  committedFiles,
  disabled,
  recentTypes,
  selectedFilePath,
  onToggleFile,
  onSelectAll,
  onDeselectAll,
  onSelectFile,
  onCommitFiles,
  onDiscardFile,
}: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [formType, setFormType] = useState<ConventionalType>('feat');
  const [formMsg, setFormMsg] = useState('');
  const [formError, setFormError] = useState(false);
  const [btnError, setBtnError] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<FileStatus | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function openForm() {
    const anySelected = files.some(
      (f) => selected.has(f.path) && !committedFiles.has(f.path),
    );
    if (!anySelected) {
      setBtnError(true);
      setTimeout(() => setBtnError(false), 1200);
      return;
    }
    setFormOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function closeForm() {
    setFormOpen(false);
    setFormMsg('');
    setFormType('feat');
    setFormError(false);
  }

  function confirmCommit() {
    const msg = formMsg.trim();
    if (!msg) {
      setFormError(true);
      setTimeout(() => setFormError(false), 1200);
      return;
    }
    const filesToCommit = files
      .filter((f) => selected.has(f.path) && !committedFiles.has(f.path))
      .map((f) => f.path);
    onCommitFiles(filesToCommit, formType, msg);
    closeForm();
  }

  const activeCount = files.filter((f) => !committedFiles.has(f.path)).length;
  const selectedCount = files.filter((f) => selected.has(f.path) && !committedFiles.has(f.path)).length;
  const allSelected = selectedCount === activeCount && activeCount > 0;

  const discardLabel = discardTarget
    ? discardTarget.status.trim() === '??'
      ? 'Delete'
      : 'Discard'
    : 'Discard';

  const discardMessage = discardTarget
    ? discardTarget.status.trim() === '??'
      ? `Delete "${discardTarget.path}"? This file will be permanently removed.`
      : `Discard changes to "${discardTarget.path}"? This will restore the file to its last committed state.`
    : '';

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>Unstaged changes</span>
        <button
          className={styles.selectAllBtn}
          onClick={allSelected ? onDeselectAll : onSelectAll}
          disabled={disabled || activeCount === 0}
        >
          {allSelected ? 'deselect all' : 'select all'}
        </button>
      </div>

      <div className={styles.fileList}>
        {files.map((f) => {
          const isCommitted = committedFiles.has(f.path);
          const isDeleted = f.status.trim() === 'D';
          const isActive = f.path === selectedFilePath;
          return (
            <div
              key={f.path}
              className={`${styles.fileRow} ${isCommitted ? styles.committed : ''} ${isActive ? styles.active : ''}`}
              onClick={() => !isCommitted && onSelectFile(f.path)}
            >
              <input
                type="checkbox"
                checked={selected.has(f.path)}
                onChange={() => onToggleFile(f.path)}
                disabled={disabled || isCommitted}
                onClick={(e) => e.stopPropagation()}
                style={{ accentColor: '#3ecf8e' }}
              />
              <span className={statusClass(f.status)}>{statusLabel(f.status)}</span>
              <span className={`${styles.fileName} ${isDeleted ? styles.deleted : ''}`}>
                {f.path}
              </span>
              {!isCommitted && (
                <button
                  className={styles.discardBtn}
                  onClick={(e) => { e.stopPropagation(); setDiscardTarget(f); }}
                  title={f.status.trim() === '??' ? 'Delete file' : 'Discard changes'}
                  disabled={disabled}
                >
                  &#x2715;
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!formOpen ? (
        <button
          className={`${styles.commitBtn} ${btnError ? styles.error : ''}`}
          onClick={openForm}
          disabled={disabled}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> commit selected files
        </button>
      ) : (
        <div className={styles.form}>
          <div className={styles.formRow}>
            <CommitTypePicker
              currentType={formType}
              recentTypes={recentTypes}
              onSelect={setFormType}
            />
            <input
              ref={inputRef}
              className={`${styles.formInput} ${formError ? styles.error : ''}`}
              type="text"
              value={formMsg}
              onChange={(e) => setFormMsg(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmCommit(); }}
              placeholder="describe this commit..."
            />
          </div>
          <div className={styles.formActions}>
            <button className={styles.cancelBtn} onClick={closeForm}>cancel</button>
            <button className={styles.addBtn} onClick={confirmCommit}>+ add commit</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={discardTarget !== null}
        title={discardLabel}
        message={discardMessage}
        confirmLabel={discardLabel}
        onConfirm={() => {
          if (discardTarget) onDiscardFile(discardTarget.path, discardTarget.status);
          setDiscardTarget(null);
        }}
        onCancel={() => setDiscardTarget(null)}
      />
    </div>
  );
}
