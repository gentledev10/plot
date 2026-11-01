import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import styles from './Select.module.css';

export function Select(props: ComponentProps<'select'>) {
  return (
    <span className={styles.control}>
      <select {...props} />
      <ChevronDown size={14} className={styles.chevron} aria-hidden="true" />
    </span>
  );
}
