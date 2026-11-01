import type { ReactNode } from 'react';
import { useT } from '../features/language/LanguageProvider';
import styles from './ToolWindowBar.module.css';

interface ToolWindowBarProps {
  side: 'left' | 'right';
  label: string;
  footer?: ReactNode;
  children: ReactNode;
}

export function ToolWindowBar({ side, label, footer, children }: ToolWindowBarProps) {
  const t = useT();
  return (
    <nav className={styles.bar} data-side={side} aria-label={t(label)}>
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
  const t = useT();
  return (
    <button
      type="button"
      className={styles.button}
      aria-label={t(label)}
      aria-pressed={pressed}
      title={shortcut ? `${t(label)} (${shortcut})` : t(label)}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
