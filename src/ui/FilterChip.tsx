import styles from './FilterChip.module.css';

export interface FilterChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  count?: number;
  children: React.ReactNode;
  className?: string;
}

export function FilterChip({ active, count, children, className, ...props }: FilterChipProps) {
  return (
    <button
      type="button"
      {...props}
      className={`${styles.chip} ${active ? styles.active : ''} ${className ?? ''}`}
    >
      {children}
      {count !== undefined && (
        <span className={styles.count}>{count}</span>
      )}
    </button>
  );
}
