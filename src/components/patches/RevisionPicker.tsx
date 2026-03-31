import type { RawPatchRevisionRef } from '../../types/radboard';
import styles from './RevisionPicker.module.css';

interface RevisionPickerProps {
  revisions: RawPatchRevisionRef[];
  selectedId: string;
  onSelect: (revisionId: string) => void;
}

export function RevisionPicker({ revisions, selectedId, onSelect }: RevisionPickerProps) {
  if (revisions.length <= 1) return null;
  return (
    <div className={styles.revisionPicker}>
      {revisions.map((rev, i) => (
        <button
          key={rev.id}
          className={`${styles.revisionPill} ${rev.id === selectedId ? styles.revisionPillActive : ''}`}
          onClick={() => onSelect(rev.id)}
          title={rev.description || `Revision ${i + 1}`}
        >
          v{i + 1}
        </button>
      ))}
    </div>
  );
}
