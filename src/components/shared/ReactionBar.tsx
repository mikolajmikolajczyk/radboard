import type { Reaction } from '../../types/kanban';
import styles from './ReactionBar.module.css';

interface ReactionBarProps {
  reactions: Reaction[];
  onReact?: (emoji: string) => void;
  onPickerOpen?: () => void;
}

export function ReactionBar({ reactions, onReact, onPickerOpen }: ReactionBarProps) {
  return (
    <div className={styles.reactionBar}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          className={styles.reaction}
          title={r.authors.join(', ')}
          onClick={() => onReact?.(r.emoji)}
        >
          {r.emoji}
          <span className={styles.reactionCount}>{r.authors.length}</span>
        </button>
      ))}
      {onPickerOpen && (
        <button className={styles.addReactionBtn} onClick={onPickerOpen} title="Add reaction">
          ＋
        </button>
      )}
    </div>
  );
}
