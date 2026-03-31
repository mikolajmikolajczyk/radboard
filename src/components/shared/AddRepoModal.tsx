import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { RepoInfo } from '../../types/radboard';
import { Modal } from '../../ui';
import styles from './AddRepoModal.module.css';

function truncateRid(rid: string) {
  return `${rid.slice(0, 10)}…${rid.slice(-6)}`;
}

interface Props {
  open: boolean;
  existingRids: string[];
  onAdd: (rid: string, localPath?: string) => void;
  onClose: () => void;
}

type Step = 'pick' | 'confirm';

export default function AddRepoModal({ open: isOpen, existingRids, onAdd, onClose }: Props) {
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [step, setStep] = useState<Step>('pick');
  const [pendingRepo, setPendingRepo] = useState<RepoInfo | null>(null);
  const [localPath, setLocalPath] = useState('');
  const [scanning, setScanning] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    invoke<RepoInfo[]>('list_repos').then(setRepos).catch(console.error);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setStep('pick');
      setPendingRepo(null);
      setLocalPath('');
    }
  }, [isOpen]);

  function selectRepo(repo: RepoInfo) {
    setPendingRepo(repo);
    setStep('confirm');
    setScanning(true);
    invoke<string | null>('find_local_repo', { rid: repo.rid })
      .then((p) => { if (p) setLocalPath(p); })
      .catch(() => {})
      .finally(() => setScanning(false));
  }

  async function browse() {
    try {
      await invoke('check_gsettings');
    } catch (e) {
      setBrowseError(String(e));
      return;
    }
    const selected = await open({ directory: true, multiple: false }) as string | null;
    if (selected) setLocalPath(selected);
  }

  function confirmAdd() {
    if (!pendingRepo) return;
    onAdd(pendingRepo.rid, localPath || undefined);
    onClose();
  }

  const available = repos.filter((r) => !existingRids.includes(r.rid));

  return (
    <Modal open={isOpen} onClose={onClose} width="min(480px, 90vw)" style={{ maxHeight: '70vh' }}>
      <Modal.Header onClose={onClose}>
        {step === 'pick' ? 'Add repo board' : pendingRepo?.name ?? 'Add repo board'}
      </Modal.Header>

      {step === 'pick' && (
        available.length === 0 ? (
          <div className={styles.empty}>
            {repos.length === 0 ? 'Loading…' : 'All local repos are already added.'}
          </div>
        ) : (
          <ul className={styles.list}>
            {available.map((repo) => (
              <li key={repo.rid}>
                <button className={styles.item} onClick={() => selectRepo(repo)}>
                  <div className={styles.itemMain}>
                    <span className={styles.itemName}>{repo.name}</span>
                    {repo.description && (
                      <span className={styles.itemDesc}>{repo.description}</span>
                    )}
                  </div>
                  <span className={styles.itemRid}>{truncateRid(repo.rid)}</span>
                  <span className={styles.itemArrow}>→</span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {step === 'confirm' && pendingRepo && (
        <div className={styles.confirmBody}>
          <button className={styles.backBtn} onClick={() => { setStep('pick'); setPendingRepo(null); setLocalPath(''); }}>
            ← back
          </button>
          <div className={styles.confirmSection}>
            <div className={styles.confirmLabel}>Local path</div>
            <div className={styles.confirmHint}>
              Optional: link to your local git checkout to enable worktree creation.
              {scanning && <span className={styles.scanning}> scanning…</span>}
            </div>
            <div className={styles.pathRow}>
              <input
                className={styles.pathInput}
                type="text"
                placeholder="not set"
                value={localPath}
                onChange={(e) => { setLocalPath(e.target.value); setBrowseError(null); }}
                spellCheck={false}
              />
              <button className={styles.browseBtn} onClick={browse}>Browse…</button>
            </div>
            {browseError && (
              <div className={styles.browseError}>{browseError}</div>
            )}
          </div>
          <div className={styles.confirmFooter}>
            <button className={styles.addBtn} onClick={confirmAdd}>Add repo</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
