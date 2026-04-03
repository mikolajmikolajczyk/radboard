import { useState } from 'react';
import {
  ALL_TYPES,
  TYPE_META,
  type ConventionalType,
} from './conventionalCommit';
import styles from './CommitTypePicker.module.css';

interface Props {
  currentType: ConventionalType | null;
  recentTypes: ConventionalType[];
  onSelect: (type: ConventionalType) => void;
  disabled?: boolean;
}

export function CommitTypePicker({ currentType, recentTypes, onSelect, disabled }: Props) {
  const [open, setOpen] = useState(false);

  const cssClass = currentType ? TYPE_META[currentType].css : 'chore';

  function handleSelect(t: ConventionalType) {
    onSelect(t);
    setOpen(false);
  }

  const otherTypes = ALL_TYPES.filter((t) => !recentTypes.includes(t));

  return (
    <div className={styles.wrap}>
      <span
        className={`${styles.badge} ${styles[cssClass]} ${disabled ? styles.disabled : ''}`}
        onClick={disabled ? undefined : () => setOpen(!open)}
      >
        {currentType ?? '—'}
      </span>

      {open && (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} />
          <div className={styles.dropdown}>
            {recentTypes.length > 0 && (
              <>
                <div className={styles.sectionHint}>recent</div>
                {recentTypes.map((t) => (
                  <button key={t} className={styles.item} onClick={() => handleSelect(t)}>
                    <span className={`${styles.itemBadge} ${styles[TYPE_META[t].css]}`}>{t}</span>
                    <span className={styles.itemDesc}>{TYPE_META[t].label}</span>
                  </button>
                ))}
                <div className={styles.separator} />
              </>
            )}
            <div className={styles.sectionHint}>all types</div>
            {otherTypes.map((t) => (
              <button key={t} className={styles.item} onClick={() => handleSelect(t)}>
                <span className={`${styles.itemBadge} ${styles[TYPE_META[t].css]}`}>{t}</span>
                <span className={styles.itemDesc}>{TYPE_META[t].label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
