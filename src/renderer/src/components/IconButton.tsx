import type { ReactNode } from 'react';
import styles from './IconButton.module.css';

interface IconButtonProps {
  label: string;
  onClick(): void;
  busy?: boolean;
  children: ReactNode;
}

export function IconButton({ label, onClick, busy = false, children }: IconButtonProps) {
  return (
    <button
      type="button"
      className={styles.button}
      aria-label={label}
      title={label}
      aria-busy={busy}
      data-busy={busy}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
