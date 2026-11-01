import type { ReactNode } from 'react';
import { useT } from '../features/language/LanguageProvider';
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
  const t = useT();
  const button = action ?? (onRetry && { label: 'Try again', run: onRetry });
  return (
    <div className={styles.message} data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      {title && <p className={styles.title}>{t(title)}</p>}
      {children && (
        <div className={styles.body}>{typeof children === 'string' ? t(children) : children}</div>
      )}
      {button && (
        <button type="button" className={styles.action} onClick={button.run}>
          {t(button.label)}
        </button>
      )}
    </div>
  );
}
