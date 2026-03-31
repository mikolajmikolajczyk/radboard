import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { RawPatchData, CommitEntry } from '../../types/radboard';
import { FileTree } from './FileTree';
import { FileViewer } from './FileViewer';
import { BranchPicker } from '../worktrees/BranchPicker';
import styles from './FilesView.module.css';

interface Props {
  rid: string;
  commitOid?: string | null;
  initialPath?: string | null;
  onReturn?: () => void;
  returnLabel?: string;
  refLabel?: string;
  patches?: RawPatchData[];
  delegateDids?: string[];
  defaultBranch?: string;
}

export default function FilesView({ rid, commitOid, initialPath, onReturn, returnLabel, refLabel, patches, delegateDids = [], defaultBranch }: Props) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Branch picker
  const [branchOid, setBranchOid] = useState<string | null>(commitOid ?? null);

  // Commit list
  const [commitCount, setCommitCount] = useState<number | null>(null);
  const [commitListOpen, setCommitListOpen] = useState(false);
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [commitsLoading, setCommitsLoading] = useState(false);
  const [commitsHasMore, setCommitsHasMore] = useState(false);
  const COMMITS_PAGE = 50;

  // Sync branchOid when commitOid prop changes
  useEffect(() => { setBranchOid(commitOid ?? null); }, [commitOid]);

  // Fetch commit count whenever branch/repo changes
  useEffect(() => {
    if (!rid) return;
    setCommitCount(null);
    invoke<number>('count_commits', { rid, commitOid: branchOid ?? '' })
      .then(setCommitCount)
      .catch(() => setCommitCount(null));
  }, [rid, branchOid]);

  const oid = branchOid ?? '';

  // ── Commit list ────────────────────────────────────────────────────────────

  function relativeTime(epochSeconds: number): string {
    const diff = Date.now() / 1000 - epochSeconds;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
    if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))}mo ago`;
    return `${Math.floor(diff / (86400 * 365))}y ago`;
  }

  function formatDay(epochSeconds: number): string {
    return new Date(epochSeconds * 1000).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  }

  async function openCommitList() {
    setCommitListOpen(true);
    setCommits([]);
    setCommitsLoading(true);
    try {
      const data = await invoke<CommitEntry[]>('list_commits', { rid, commitOid: oid, offset: 0, limit: COMMITS_PAGE });
      setCommits(data);
      setCommitsHasMore(data.length === COMMITS_PAGE);
    } finally {
      setCommitsLoading(false);
    }
  }

  async function loadMoreCommits() {
    setCommitsLoading(true);
    try {
      const data = await invoke<CommitEntry[]>('list_commits', { rid, commitOid: oid, offset: commits.length, limit: COMMITS_PAGE });
      setCommits((prev) => [...prev, ...data]);
      setCommitsHasMore(data.length === COMMITS_PAGE);
    } finally {
      setCommitsLoading(false);
    }
  }

  function renderCommitList() {
    const groups: { day: string; entries: CommitEntry[] }[] = [];
    for (const c of commits) {
      const day = formatDay(c.committerTimestamp);
      if (groups.length === 0 || groups[groups.length - 1].day !== day) {
        groups.push({ day, entries: [] });
      }
      groups[groups.length - 1].entries.push(c);
    }
    return (
      <div className={styles.commitListPanel}>
        <div className={styles.commitListScroll}>
          {commitsLoading && commits.length === 0 && (
            <div className={styles.commitListLoading}>Loading…</div>
          )}
          {groups.map((group) => (
            <div key={group.day}>
              <div className={styles.commitDayHeader}>{group.day}</div>
              {group.entries.map((c) => {
                const sameAuthorCommitter = c.author === c.committer;
                return (
                  <div key={c.oid} className={styles.commitRow}>
                    <div className={styles.commitMain}>
                      <span className={styles.commitSummary}>{c.summary}</span>
                      <div className={styles.commitMeta}>
                        <span className={styles.commitAuthor}>{c.author}</span>
                        {sameAuthorCommitter ? (
                          <span className={styles.commitVerb}>committed</span>
                        ) : (
                          <>
                            <span className={styles.commitVerb}>authored and</span>
                            <span className={styles.commitAuthor}>{c.committer}</span>
                            <span className={styles.commitVerb}>committed</span>
                          </>
                        )}
                        <span className={styles.commitOidChip}>{c.oid.slice(0, 7)}</span>
                        <span className={styles.commitTime}>{relativeTime(c.committerTimestamp)}</span>
                      </div>
                    </div>
                    <button
                      className={styles.commitBrowseBtn}
                      title="Browse files at this commit"
                      onClick={() => { setBranchOid(c.oid); setCommitListOpen(false); }}
                    >{'<>'}</button>
                  </div>
                );
              })}
            </div>
          ))}
          {commitsHasMore && (
            <button className={styles.loadMoreBtn} onClick={loadMoreCommits} disabled={commitsLoading}>
              {commitsLoading ? 'Loading…' : 'Load more commits'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.container}>

      {/* ── Ribbon ── */}
      <div className={styles.ribbon}>
        {onReturn && (
          <>
            <button className={styles.returnBtn} onClick={onReturn}>
              ← {returnLabel ?? 'Back'}
            </button>
            <div className={styles.ribbonSep} />
          </>
        )}

        <button
          className={`${styles.ribbonTab} ${!commitListOpen ? styles.ribbonTabActive : ''}`}
          onClick={() => setCommitListOpen(false)}
        >
          Files
        </button>
        <button
          className={`${styles.ribbonTab} ${commitListOpen ? styles.ribbonTabActive : ''}`}
          onClick={openCommitList}
        >
          Commits
          <span className={styles.ribbonTabCount}>{commitCount !== null ? commitCount.toLocaleString() : '…'}</span>
        </button>

        <div className={styles.ribbonSpacer} />

        {refLabel && (
          <span className={styles.tagLabel}>
            <span className={styles.tagLabelIcon}>◈</span>
            {refLabel}
          </span>
        )}

        {patches && patches.length > 0 && (
          <BranchPicker
            patches={patches}
            delegateDids={delegateDids}
            defaultBranch={defaultBranch}
            selectedOid={branchOid}
            onSelect={setBranchOid}
          />
        )}
      </div>

      {/* ── Body ── */}
      {commitListOpen ? renderCommitList() : (
        <div className={styles.panels}>
          <div className={styles.treePanel}>
            <FileTree
              rid={rid}
              branchOid={branchOid}
              initialPath={initialPath}
              selectedFile={selectedFile}
              onFileSelect={setSelectedFile}
            />
          </div>
          <FileViewer
            rid={rid}
            filePath={selectedFile}
            branchOid={branchOid}
          />
        </div>
      )}
    </div>
  );
}
