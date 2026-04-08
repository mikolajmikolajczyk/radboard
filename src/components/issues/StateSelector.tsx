import { useRef, useState } from 'react';
import { useRepo } from '../../contexts/RepoContext';
import styles from './StateSelector.module.css';

interface StateSelectorProps {
  currentColumnId: string;
  canEdit: boolean;
  onSelect: (colId: string) => void;
  solvedHint?: boolean;
}

export function StateSelector({ currentColumnId, canEdit, onSelect, solvedHint }: StateSelectorProps) {
  const { columns: availableColumns } = useRepo();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const currentTitle = availableColumns.find((c) => c.id === currentColumnId)?.title ?? currentColumnId;

  function handleOpen() {
    if (!canEdit) return;
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function close() { setOpen(false); setInput(''); }

  function select(colId: string) {
    if (colId !== currentColumnId) onSelect(colId);
    close();
  }

  const inputSlug = input.trim().toLowerCase().replace(/\s+/g, '-');
  const filtered = availableColumns.filter((c) =>
    input === '' ||
    c.title.toLowerCase().includes(input.toLowerCase()) ||
    c.id.toLowerCase().includes(input.toLowerCase()),
  );
  const canCreate = inputSlug.length > 0 && !availableColumns.some((c) => c.id === inputSlug);

  const effectiveStyle = solvedHint && currentColumnId === 'closed' ? styles.solved : null;
  const badgeCls = effectiveStyle
    ?? (currentColumnId === 'closed' ? styles.closed
    : currentColumnId === 'open'   ? styles.open
    : styles.stateDynamic);

  const displayTitle = solvedHint && currentColumnId === 'closed' ? 'Solved' : currentTitle;

  return (
    <div className={styles.stateSelector}>
      <span
        className={`${styles.statusBadge} ${badgeCls} ${canEdit ? styles.stateSelectorTrigger : ''}`}
        onClick={handleOpen}
        role={canEdit ? 'button' : undefined}
        title={canEdit ? 'Change state' : undefined}
      >
        {displayTitle}
        {canEdit && <span className={styles.stateCaret}>▾</span>}
      </span>
      {open && (
        <>
          <div className={styles.pickerBackdrop} onClick={close} />
          <div className={styles.statePicker}>
            <input
              ref={inputRef}
              className={styles.statePickerInput}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="filter or type new…"
              onKeyDown={(e) => {
                if (e.key === 'Escape') { close(); return; }
                if (e.key === 'Enter') {
                  if (canCreate) select(inputSlug);
                  else if (filtered.length > 0) select(filtered[0].id);
                }
              }}
            />
            <div className={styles.stateOptions}>
              {filtered.map((c) => (
                <button
                  key={c.id}
                  className={`${styles.stateOption} ${c.id === currentColumnId ? styles.stateOptionCurrent : ''}`}
                  onClick={() => select(c.id)}
                >
                  {c.title}
                </button>
              ))}
              {canCreate && (
                <button
                  className={`${styles.stateOption} ${styles.stateOptionCreate}`}
                  onClick={() => select(inputSlug)}
                >
                  Create "{inputSlug}"
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
