import type { ReactNode, Ref } from 'react';
import { useT } from '../features/language/LanguageProvider';
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
  const t = useT();
  return (
    <button
      ref={ref}
      type="button"
      className={styles.button}
      aria-label={t(label)}
      title={t(label)}
      aria-busy={busy}
      aria-expanded={expanded}
      data-busy={busy}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
