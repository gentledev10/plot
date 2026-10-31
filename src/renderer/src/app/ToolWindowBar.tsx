import type { ReactNode } from 'react';
import styles from './ToolWindowBar.module.css';

interface ToolWindowBarProps {
  side: 'left' | 'right';
  label: string;
  footer?: ReactNode;
  children: ReactNode;
}

export function ToolWindowBar({ side, label, footer, children }: ToolWindowBarProps) {
  return (
    <nav className={styles.bar} data-side={side} aria-label={label}>
      <div className={styles.group}>{children}</div>
      {footer && <div className={styles.group}>{footer}</div>}
    </nav>
  );
}

interface ToolWindowButtonProps {
  label: string;
  shortcut?: string;
  pressed?: boolean;
  onClick(): void;
  children: ReactNode;
}

export function ToolWindowButton({
  label,
  shortcut,
  pressed,
  onClick,
  children,
}: ToolWindowButtonProps) {
  return (
    <button
      type="button"
      className={styles.button}
      aria-label={label}
      aria-pressed={pressed}
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
