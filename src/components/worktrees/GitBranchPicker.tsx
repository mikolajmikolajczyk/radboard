import { useState, useRef, useMemo } from 'react';
import { useOutsideClick } from '../../ui';
import styles from './BranchPicker.module.css';

interface GitBranchPickerProps {
  branches: string[];
  currentBranch: string;
  selected: string;
  onSelect: (branch: string) => void;
}

export function GitBranchPicker({ branches, currentBranch, selected, onSelect }: GitBranchPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClick(ref, () => setOpen(false), open);

  const filtered = useMemo(() => {
    if (!search) return branches;
    const q = search.toLowerCase();
    return branches.filter((b) => b.toLowerCase().includes(q));
  }, [branches, search]);

  return (
    <div className={styles.branchPickerDropdown} ref={ref}>
      <button
        className={`${styles.branchPickerBtn} ${open ? styles.branchPickerBtnOpen : ''}`}
        onClick={() => { setOpen(!open); setSearch(''); }}
        title="Select source branch"
        style={{ maxWidth: '100%', width: '100%' }}
      >
        <span className={styles.branchPickerIcon}>⎇</span>
        <span className={styles.branchPickerLabel}>{selected}</span>
        <span className={styles.branchPickerChevron}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className={styles.branchPickerPanel} style={{ left: 0, right: 'auto' }}>
          <input
            className={styles.branchSearchInput}
            type="text"
            placeholder="Filter branches…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className={styles.branchList}>
            {filtered.map((b) => (
              <button
                key={b}
                className={`${styles.branchRow} ${b === selected ? styles.branchRowActive : ''}`}
                onClick={() => { onSelect(b); setOpen(false); setSearch(''); }}
              >
                <span className={styles.branchIcon}>⎇</span>
                <span className={styles.branchName}>{b}</span>
                {b === currentBranch && (
                  <span className={`${styles.branchBadge} ${styles.branchBadgeCanonical}`}>HEAD</span>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className={styles.branchEmpty}>No branches match</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
