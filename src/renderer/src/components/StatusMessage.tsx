import type { ReactNode } from 'react';
import styles from './StatusMessage.module.css';

interface StatusMessageProps {
  title?: string;
  tone?: 'neutral' | 'error';
  onRetry?(): void;
  children?: ReactNode;
}

export function StatusMessage({ title, tone = 'neutral', onRetry, children }: StatusMessageProps) {
  return (
    <div className={styles.message} data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      {title && <p className={styles.title}>{title}</p>}
      {children && <div className={styles.body}>{children}</div>}
      {onRetry && (
        <button type="button" className={styles.retry} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
