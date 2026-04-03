import { useRef, useState } from 'react';
import { CommitTypePicker } from './CommitTypePicker';
import {
  type ConventionalType,
  isSkipped,
  parseConventional,
  formatConventional,
} from './conventionalCommit';
import styles from './CommitCard.module.css';

export interface EnrichedCommit {
  oid: string;
  shortOid: string;
  type: ConventionalType | null;
  scope: string | null;
  description: string;
  fullMessage: string;
  timestamp: number;
  isHead: boolean;
  isSkipped: boolean;
  isFirst: boolean;
}

interface Props {
  commit: EnrichedCommit;
  selected: boolean;
  recentTypes: ConventionalType[];
  disabled: boolean;
  onSelect: () => void;
  onTypeChange: (newType: ConventionalType) => void;
  onMessageChange: (newMessage: string) => void;
  onMergeUp: () => void;
  onUncommit: () => void;
}

function formatTimestamp(epoch: number): string {
  const d = new Date(epoch * 1000);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${Y}-${M}-${D} ${h}:${m}`;
}

export function enrichCommit(
  entry: { oid: string; shortOid: string; summary: string; timestamp: number },
  index: number,
  total: number,
): EnrichedCommit {
  const parsed = parseConventional(entry.summary);
  const type = parsed?.type ?? null;
  return {
    oid: entry.oid,
    shortOid: entry.shortOid,
    type,
    scope: parsed?.scope ?? null,
    description: parsed?.description ?? entry.summary,
    fullMessage: entry.summary,
    timestamp: entry.timestamp,
    isHead: index === total - 1,
    isSkipped: type !== null && isSkipped(type),
    isFirst: index === 0,
  };
}

export default function CommitCard({
  commit,
  selected,
  recentTypes,
  disabled,
  onSelect,
  onTypeChange,
  onMessageChange,
  onMergeUp,
  onUncommit,
}: Props) {
  const [editMsg, setEditMsg] = useState(commit.description);
  const originalMsg = useRef(commit.description);

  // Sync when commit changes (e.g. after rebase)
  if (originalMsg.current !== commit.description) {
    originalMsg.current = commit.description;
    setEditMsg(commit.description);
  }

  function handleBlur() {
    const trimmed = editMsg.trim();
    if (trimmed && trimmed !== commit.description) {
      const newFull = commit.type
        ? formatConventional(commit.type, commit.scope, trimmed)
        : trimmed;
      onMessageChange(newFull);
    } else {
      setEditMsg(commit.description);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    }
  }

  function handleTypeChange(newType: ConventionalType) {
    onTypeChange(newType);
  }

  const cardClass = [
    styles.card,
    selected ? styles.selected : '',
    commit.isSkipped ? styles.skipped : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cardClass} onClick={onSelect}>
      <div className={styles.topRow}>
        <CommitTypePicker
          currentType={commit.type}
          recentTypes={recentTypes}
          onSelect={handleTypeChange}
          disabled={disabled}
        />
        <span className={styles.hash}>[{commit.shortOid}]</span>
        <span className={styles.timestamp}>{formatTimestamp(commit.timestamp)}</span>
        {commit.isSkipped && <span className={styles.skipLabel}>&middot; skipped</span>}
        {commit.isHead && <span className={styles.headLabel}>HEAD</span>}

        {!commit.isFirst && (
          <button
            className={styles.mergeBtn}
            onClick={(e) => { e.stopPropagation(); onMergeUp(); }}
            title="squash into commit above"
            disabled={disabled}
          >
            &#x2191;
          </button>
        )}
        {commit.isHead && (
          <button
            className={styles.uncommitBtn}
            onClick={(e) => { e.stopPropagation(); onUncommit(); }}
            title="undo this commit, return files to unstaged"
            disabled={disabled}
          >
            uncommit
          </button>
        )}
      </div>

      <input
        className={styles.messageInput}
        type="text"
        value={editMsg}
        onChange={(e) => setEditMsg(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        disabled={disabled}
      />
    </div>
  );
}
