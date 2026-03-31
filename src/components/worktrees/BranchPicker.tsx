import { useState, useRef, useMemo } from 'react';
import { useOutsideClick } from '../../ui';
import type { RawPatchData } from '../../types/radboard';
import styles from './BranchPicker.module.css';

interface AuthorGroup {
  authorDid: string;
  authorName: string;
  isDelegate: boolean;
  patches: RawPatchData[];
}

interface BranchPickerProps {
  patches: RawPatchData[];
  delegateDids: string[];
  defaultBranch?: string;
  selectedOid: string | null;
  onSelect: (oid: string | null) => void;
}

export function BranchPicker({ patches, delegateDids, defaultBranch, selectedOid, onSelect }: BranchPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedAuthors, setExpandedAuthors] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClick(ref, () => setOpen(false), open);

  const mainLabel = defaultBranch ?? 'main';
  const selectedPatch = patches.find((p) => p.head === selectedOid);
  const branchLabel = selectedOid === null ? mainLabel : (selectedPatch ? selectedPatch.title : selectedOid.slice(0, 7));

  function formatAuthorShort(author: string): string {
    if (author.startsWith('did:key:')) {
      const key = author.slice('did:key:'.length);
      return key.slice(0, 6) + '…' + key.slice(-4);
    }
    return author;
  }

  const authorGroups = useMemo<AuthorGroup[]>(() => {
    if (!patches || patches.length === 0) return [];
    const byDid = new Map<string, AuthorGroup>();
    const activePatchStates = new Set(['open', 'draft']);
    const q = search.toLowerCase();
    for (const p of patches) {
      if (!activePatchStates.has(p.state)) continue;
      if (q && !p.title.toLowerCase().includes(q) && !p.author.toLowerCase().includes(q)) continue;
      if (!byDid.has(p.authorDid)) {
        byDid.set(p.authorDid, {
          authorDid: p.authorDid,
          authorName: p.author,
          isDelegate: delegateDids?.includes(p.authorDid) ?? false,
          patches: [],
        });
      }
      byDid.get(p.authorDid)!.patches.push(p);
    }
    return [...byDid.values()].sort((a, b) => {
      if (a.isDelegate !== b.isDelegate) return a.isDelegate ? -1 : 1;
      return a.authorName.localeCompare(b.authorName);
    });
  }, [patches, delegateDids, search]);

  const mainSelected = selectedOid === null;
  const mainMatchesSearch = !search || mainLabel.toLowerCase().includes(search.toLowerCase());

  return (
    <div className={styles.branchPickerDropdown} ref={ref}>
      <button
        className={`${styles.branchPickerBtn} ${open ? styles.branchPickerBtnOpen : ''} ${selectedOid ? styles.branchPickerBtnAlt : ''}`}
        onClick={() => { setOpen(!open); setSearch(''); }}
        title="Switch branch"
      >
        {selectedPatch && (
          <>
            <span className={styles.branchPickerOid}>{selectedPatch.head.slice(0, 7)}</span>
            <span className={styles.branchPickerSep}>/</span>
            <span className={styles.branchPickerAuthor}>{formatAuthorShort(selectedPatch.author)}</span>
            <span className={styles.branchPickerSep}>/</span>
          </>
        )}
        <span className={styles.branchPickerIcon}>⎇</span>
        <span className={styles.branchPickerLabel}>{branchLabel}</span>
        <span className={styles.branchPickerChevron}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className={styles.branchPickerPanel}>
          <input
            className={styles.branchSearchInput}
            type="text"
            placeholder="Search branches…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className={styles.branchList}>
            {mainMatchesSearch && (
              <button
                className={`${styles.branchRow} ${mainSelected ? styles.branchRowActive : ''}`}
                onClick={() => { onSelect(null); setOpen(false); setSearch(''); }}
              >
                <span className={styles.branchIcon}>⎇</span>
                <span className={styles.branchName}>{mainLabel}</span>
                <span className={`${styles.branchBadge} ${styles.branchBadgeCanonical}`}>Canonical</span>
              </button>
            )}
            {authorGroups.length > 0 && mainMatchesSearch && <div className={styles.branchSep} />}
            {authorGroups.map((group) => {
              const isExpanded = expandedAuthors.has(group.authorDid);
              return (
                <div key={group.authorDid}>
                  <button
                    className={styles.branchAuthorRow}
                    onClick={() => setExpandedAuthors((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.authorDid)) next.delete(group.authorDid); else next.add(group.authorDid);
                      return next;
                    })}
                  >
                    <span className={styles.branchAuthorChevron}>{isExpanded ? '▼' : '▶'}</span>
                    <span className={styles.branchAuthorName}>{formatAuthorShort(group.authorName)}</span>
                    {group.isDelegate && <span className={`${styles.branchBadge} ${styles.branchBadgeDelegate}`}>Delegate</span>}
                    <span className={styles.branchPatchCount}>{group.patches.length}</span>
                  </button>
                  {isExpanded && group.patches.map((p) => (
                    <button
                      key={p.id}
                      className={`${styles.branchRow} ${styles.branchRowIndented} ${selectedOid === p.head ? styles.branchRowActive : ''}`}
                      onClick={() => { onSelect(p.head); setOpen(false); setSearch(''); }}
                    >
                      <span className={styles.branchIcon}>⎇</span>
                      <span className={styles.branchName}>{p.title}</span>
                      <span className={styles.branchOid}>{p.head.slice(0, 7)}</span>
                    </button>
                  ))}
                </div>
              );
            })}
            {authorGroups.length === 0 && !mainMatchesSearch && (
              <div className={styles.branchEmpty}>No branches match</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
