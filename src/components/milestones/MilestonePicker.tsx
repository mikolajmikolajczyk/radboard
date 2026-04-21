import { useState, useRef } from 'react';
import { useOutsideClick } from '../../ui';
import { formatMilestoneDisplay } from './MilestonesView';
import styles from './MilestonePicker.module.css';

interface Props {
  current: string[];         // raw milestone names (without prefix)
  suggestions: string[];     // all known milestone names
  onChange: (milestones: string[]) => void;
  readOnly?: boolean;
}

export function MilestonePicker({ current, suggestions, onChange, readOnly }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClick(ref, () => setOpen(false), open);

  const q = search.toLowerCase();
  const filtered = suggestions.filter((s) => !current.includes(s) && formatMilestoneDisplay(s).toLowerCase().includes(q));
  const canAddNew = search.trim() && !suggestions.includes(search.trim()) && !current.includes(search.trim());

  function toggle(ms: string) {
    if (current.includes(ms)) {
      onChange(current.filter((m) => m !== ms));
    } else {
      onChange([...current, ms]);
    }
  }

  function addNew() {
    const name = search.trim();
    if (!name) return;
    onChange([...current, name]);
    setSearch('');
  }

  if (readOnly) {
    if (current.length === 0) return <span className={styles.empty}>none</span>;
    return (
      <div className={styles.chips}>
        {current.map((ms) => (
          <span key={ms} className={styles.chip}>{formatMilestoneDisplay(ms)}</span>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.picker} ref={ref}>
      <div className={styles.chips}>
        {current.map((ms) => (
          <span key={ms} className={styles.chip}>
            {formatMilestoneDisplay(ms)}
            <button className={styles.chipRemove} onClick={() => toggle(ms)}>×</button>
          </span>
        ))}
        <button className={styles.addBtn} onClick={() => { setOpen(!open); setSearch(''); }}>
          {current.length === 0 ? 'Set milestone' : '+'}
        </button>
      </div>
      {open && (
        <div className={styles.panel}>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search or create…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canAddNew) { addNew(); }
            }}
            autoFocus
          />
          <div className={styles.list}>
            {current.map((ms) => (
              <button key={ms} className={`${styles.row} ${styles.rowActive}`} onClick={() => toggle(ms)}>
                <span className={styles.check}>✓</span>
                <span className={styles.rowName}>{formatMilestoneDisplay(ms)}</span>
                <span className={styles.rowRaw}>{ms}</span>
              </button>
            ))}
            {current.length > 0 && filtered.length > 0 && <div className={styles.sep} />}
            {filtered.map((ms) => (
              <button key={ms} className={styles.row} onClick={() => toggle(ms)}>
                <span className={styles.check} />
                <span className={styles.rowName}>{formatMilestoneDisplay(ms)}</span>
                <span className={styles.rowRaw}>{ms}</span>
              </button>
            ))}
            {canAddNew && (
              <>
                {(current.length > 0 || filtered.length > 0) && <div className={styles.sep} />}
                <button className={`${styles.row} ${styles.rowCreate}`} onClick={addNew}>
                  <span className={styles.createIcon}>+</span>
                  <span className={styles.rowName}>Create "{search.trim()}"</span>
                </button>
              </>
            )}
            {filtered.length === 0 && !canAddNew && current.length === 0 && (
              <div className={styles.emptyList}>No milestones yet</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
