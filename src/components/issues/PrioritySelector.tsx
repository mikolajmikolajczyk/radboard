import { useState } from 'react';
import type { PriorityLevel } from '../../types/kanban';
import { PRIORITY_LEVELS } from '../../types/kanban';
import styles from './PrioritySelector.module.css';

interface Props {
  current: PriorityLevel | undefined;
  canEdit: boolean;
  onSelect: (priority: PriorityLevel) => void;
  compact?: boolean;
}

const LABELS: Record<PriorityLevel, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function PrioritySelector({ current, canEdit, onSelect, compact }: Props) {
  const [open, setOpen] = useState(false);

  function handleOpen() {
    if (!canEdit) return;
    setOpen(true);
  }

  function close() { setOpen(false); }

  function select(level: PriorityLevel) {
    if (level !== current) onSelect(level);
    close();
  }

  const colorCls = current ? styles[current] : styles.none;

  return (
    <div className={`${styles.selector} ${compact ? styles.compact : ''}`}>
      <span
        className={`${styles.badge} ${colorCls} ${canEdit ? styles.trigger : ''}`}
        onClick={handleOpen}
        role={canEdit ? 'button' : undefined}
        title={canEdit ? (current ? `Priority: ${LABELS[current]}` : 'Set priority') : (current ? LABELS[current] : undefined)}
      >
        {compact ? (
          <span className={`${styles.badgeDot} ${current ? styles[`dot_${current}`] : styles.dot_none}`} />
        ) : (
          current ? LABELS[current] : 'none'
        )}
        {canEdit && <span className={styles.caret}>▾</span>}
      </span>
      {open && (
        <>
          <div className={styles.backdrop} onClick={close} />
          <div className={styles.picker}>
            <div className={styles.options}>
              {PRIORITY_LEVELS.map((level) => (
                <button
                  key={level}
                  className={`${styles.option} ${styles[level]} ${level === current ? styles.optionCurrent : ''}`}
                  onClick={() => select(level)}
                >
                  <span className={styles.dot} />
                  {LABELS[level]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
