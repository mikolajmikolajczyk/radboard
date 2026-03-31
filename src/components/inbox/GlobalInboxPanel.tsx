import { useState } from 'react';
import type { NotificationData } from '../../types/radboard';
import { Modal, Button, FilterChip } from '../../ui';
import styles from './GlobalInboxPanel.module.css';
import NotificationRow from './NotificationRow';

type Filter = 'all' | 'unread' | 'read';

interface Props {
  open: boolean;
  notifications: NotificationData[];
  onClose: () => void;
  onMarkRead: (ids: number[]) => void;
  onClear: (ids: number[]) => void;
  onNavigate: (notification: NotificationData) => void;
}

const PANEL_STYLE: React.CSSProperties = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 'auto',
  transform: 'none',
  width: 480,
  maxHeight: '100vh',
  borderRadius: 0,
  borderLeft: '1px solid var(--border-2)',
  border: 'none',
  borderLeftWidth: 1,
  borderLeftStyle: 'solid',
  borderLeftColor: 'var(--border-2)',
  animation: 'slideIn 0.18s ease-out',
};

export default function GlobalInboxPanel({ open, notifications, onClose, onMarkRead, onClear, onNavigate }: Props) {
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = filter === 'all'
    ? notifications
    : notifications.filter((n) => n.status === filter);

  // Group filtered notifications by repo
  const groups: { repoName: string; repo: string; items: NotificationData[] }[] = [];
  const seenRepos = new Map<string, number>();
  for (const n of filtered) {
    const idx = seenRepos.get(n.repo);
    if (idx !== undefined) {
      groups[idx].items.push(n);
    } else {
      seenRepos.set(n.repo, groups.length);
      groups.push({ repoName: n.repoName, repo: n.repo, items: [n] });
    }
  }

  const unreadCount = notifications.filter((n) => n.status === 'unread').length;
  const readCount = notifications.length - unreadCount;
  const unreadIds = notifications.filter((n) => n.status === 'unread').map((n) => n.id);

  return (
    <Modal open={open} onClose={onClose} style={PANEL_STYLE}>
      <div className={styles.header}>
        <span className={styles.title}>Inbox</span>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className={styles.toolbar}>
        {(['all', 'unread', 'read'] as const).map((f) => {
          const count = f === 'all' ? notifications.length : f === 'unread' ? unreadCount : readCount;
          return (
            <FilterChip
              key={f}
              active={filter === f}
              count={count}
              onClick={() => setFilter(f)}
            >
              {f}
            </FilterChip>
          );
        })}
        <div className={styles.spacer} />
        <Button size="sm" disabled={unreadIds.length === 0} onClick={() => onMarkRead(unreadIds)}>
          Mark all read
        </Button>
        <Button size="sm" disabled={notifications.length === 0} onClick={() => onClear([])}>
          Clear all
        </Button>
      </div>

      <div className={styles.body}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            {notifications.length === 0 ? 'No notifications' : 'No matching notifications'}
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.repo} className={styles.group}>
              <div className={styles.groupHeader}>
                <span className={styles.groupName}>{group.repoName}</span>
                <span className={styles.groupCount}>{group.items.length}</span>
              </div>
              {group.items.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onMarkRead={onMarkRead}
                  onClear={onClear}
                  onNavigate={(notif) => { onNavigate(notif); onClose(); }}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
