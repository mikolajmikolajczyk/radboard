import styles from './Badge.module.css';

export interface BadgeProps {
  variant: 'open' | 'merged' | 'draft' | 'in-progress' | 'closed' | 'archived';
  size?: 'sm' | 'md';
  children: React.ReactNode;
  className?: string;
}

const variantClass: Record<BadgeProps['variant'], string> = {
  open: styles.open,
  merged: styles.merged,
  draft: styles.draft,
  'in-progress': styles.in_progress,
  closed: styles.closed,
  archived: styles.archived,
};

export function Badge({ variant, size = 'md', children, className }: BadgeProps) {
  return (
    <span className={`${styles.base} ${variantClass[variant]} ${styles[size]} ${className ?? ''}`}>
      {children}
    </span>
  );
}
