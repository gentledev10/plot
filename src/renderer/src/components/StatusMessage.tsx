import type { ReactNode } from 'react';
import styles from './StatusMessage.module.css';

interface StatusAction {
  label: string;
  run(): void;
}

interface StatusMessageProps {
  title?: string;
  tone?: 'neutral' | 'error';
  onRetry?(): void;
  action?: StatusAction;
  children?: ReactNode;
}

export function StatusMessage({
  title,
  tone = 'neutral',
  onRetry,
  action,
  children,
}: StatusMessageProps) {
  const button = action ?? (onRetry && { label: 'Try again', run: onRetry });
  return (
    <div className={styles.message} data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      {title && <p className={styles.title}>{title}</p>}
      {children && <div className={styles.body}>{children}</div>}
      {button && (
        <button type="button" className={styles.action} onClick={button.run}>
          {button.label}
        </button>
      )}
    </div>
  );
}
