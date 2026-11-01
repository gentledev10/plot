import type { ReactNode, Ref } from 'react';
import styles from './IconButton.module.css';

interface IconButtonProps {
  label: string;
  onClick(): void;
  busy?: boolean;
  expanded?: boolean;
  ref?: Ref<HTMLButtonElement>;
  children: ReactNode;
}

export function IconButton({
  label,
  onClick,
  busy = false,
  expanded,
  ref,
  children,
}: IconButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      className={styles.button}
      aria-label={label}
      title={label}
      aria-busy={busy}
      aria-expanded={expanded}
      data-busy={busy}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
