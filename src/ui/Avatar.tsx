import styles from './Avatar.module.css';

export interface AvatarProps {
  name: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function Avatar({ name, size = 'md', className }: AvatarProps) {
  const initials = name.slice(0, 2).toLowerCase();
  return (
    <span className={`${styles.avatar} ${styles[size]} ${className ?? ''}`}>
      {initials}
    </span>
  );
}
