import { useState, useCallback } from 'react';
import type React from 'react';
import styles from './IssueIdBadge.module.css';

interface Props {
  id: string;
  className?: string;
  /** Optional secondary action (e.g. opening the issue in Radicle Explorer) on middle-click. */
  onSecondary?: () => void;
  /** Optional label on hover when not yet copied. */
  title?: string;
}

export function IssueIdBadge({ id, className, onSecondary, title }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }).catch(console.error);
  }, [id]);

  function onAuxClick(e: React.MouseEvent) {
    if (e.button === 1 && onSecondary) {
      e.preventDefault();
      onSecondary();
    }
  }

  return (
    <button
      type="button"
      className={`${styles.badge} ${copied ? styles.copied : ''} ${className ?? ''}`}
      onClick={copy}
      onAuxClick={onAuxClick}
      onPointerDown={(e) => e.stopPropagation()}
      title={copied ? 'Copied!' : (title ?? `Click to copy ${id}`)}
    >
      <span className={styles.dot} />
      <span className={styles.text}>{copied ? 'copied' : id.slice(0, 7)}</span>
    </button>
  );
}
