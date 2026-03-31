import { useState } from 'react';
import type { NotificationData } from '../../types/radboard';
import { Button, FilterChip } from '../../ui';
import styles from './InboxView.module.css';
import NotificationRow from './NotificationRow';

type Filter = 'all' | 'unread' | 'read';

interface Props {
  notifications: NotificationData[];
  onMarkRead: (ids: number[]) => void;
  onClear: (ids: number[]) => void;
  onNavigate: (notification: NotificationData) => void;
}

export default function InboxView({ notifications, onMarkRead, onClear, onNavigate }: Props) {
  const [filter, setFilter] = useState<Filter>('all');

  const unreadCount = notifications.filter((n) => n.status === 'unread').length;
  const readCount = notifications.length - unreadCount;

  const filtered = filter === 'all'
    ? notifications
    : notifications.filter((n) => n.status === filter);

  const unreadIds = notifications.filter((n) => n.status === 'unread').map((n) => n.id);

  return (
    <div className={styles.container}>
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

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          {notifications.length === 0 ? 'No notifications' : 'No matching notifications'}
        </div>
      ) : (
        <div className={styles.list}>
          {filtered.map((n) => (
            <NotificationRow
              key={n.id}
              notification={n}
              onMarkRead={onMarkRead}
              onClear={onClear}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
