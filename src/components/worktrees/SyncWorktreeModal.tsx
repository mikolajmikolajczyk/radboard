import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Modal, Button } from '../../ui';
import { useRepo } from '../../contexts/RepoContext';
import { GitBranchPicker } from './GitBranchPicker';
import styles from './SyncWorktreeModal.module.css';

interface Props {
  open: boolean;
  worktreePath: string;
  worktreeBranch: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Strategy = 'rebase' | 'merge';

export default function SyncWorktreeModal({ open, worktreePath, worktreeBranch, onClose, onSuccess }: Props) {
  const { defaultBranch, localRepoPath } = useRepo();
  const [branches, setBranches] = useState<string[]>([]);
  const [baseBranch, setBaseBranch] = useState(defaultBranch || 'master');
  const [strategy, setStrategy] = useState<Strategy>('rebase');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !localRepoPath) return;
    setBaseBranch(defaultBranch || 'master');
    setError(null);
    setResult(null);
    invoke<string[]>('list_branches', { localPath: localRepoPath })
      .then((bs) => setBranches(bs.filter((b) => b !== worktreeBranch)))
      .catch((e) => setError(String(e)));
  }, [open, localRepoPath, defaultBranch, worktreeBranch]);

  async function handleSync() {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const msg = await invoke<string>('sync_worktree', { worktreePath, baseBranch, strategy });
      setResult(msg);
      onSuccess();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} width={520}>
      <Modal.Header onClose={onClose}>Sync worktree</Modal.Header>
      <div className={styles.body}>
        <div className={styles.row}>
          <span className={styles.label}>worktree</span>
          <code className={styles.value}>{worktreeBranch}</code>
        </div>

        <div className={styles.row}>
          <span className={styles.label}>base branch</span>
          <GitBranchPicker
            branches={branches}
            currentBranch={defaultBranch || ''}
            selected={baseBranch}
            onSelect={setBaseBranch}
          />
        </div>

        <div className={styles.row}>
          <span className={styles.label}>strategy</span>
          <div className={styles.strategy}>
            <label className={`${styles.strategyOption} ${strategy === 'rebase' ? styles.strategyActive : ''}`}>
              <input
                type="radio"
                name="strategy"
                value="rebase"
                checked={strategy === 'rebase'}
                onChange={() => setStrategy('rebase')}
              />
              <span>
                <strong>rebase</strong>
                <span className={styles.hint}>replay worktree commits on top of base — keeps history linear</span>
              </span>
            </label>
            <label className={`${styles.strategyOption} ${strategy === 'merge' ? styles.strategyActive : ''}`}>
              <input
                type="radio"
                name="strategy"
                value="merge"
                checked={strategy === 'merge'}
                onChange={() => setStrategy('merge')}
              />
              <span>
                <strong>merge</strong>
                <span className={styles.hint}>create a merge commit — preserves branch shape</span>
              </span>
            </label>
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {result && <div className={styles.success}>{result}</div>}
      </div>
      <Modal.Footer>
        <Button onClick={onClose} disabled={submitting}>{result ? 'Close' : 'Cancel'}</Button>
        {!result && (
          <Button variant="primary" onClick={handleSync} disabled={submitting || !baseBranch}>
            {submitting ? 'Syncing…' : `Sync (${strategy})`}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
