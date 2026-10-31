import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { IconButton } from '../../components/IconButton';
import { AccountsSettings } from '../accounts/AccountsSettings';
import { AiReviewSettings } from '../ai/AiReviewSettings';
import { useSuspendShortcuts } from '../keymap/KeymapProvider';
import { KeymapSettings } from '../keymap/KeymapSettings';
import styles from './SettingsDialog.module.css';

export type SettingsSection = 'accounts' | 'ai' | 'keymap';

const SECTIONS: readonly { id: SettingsSection; title: string; render(): ReactNode }[] = [
  { id: 'accounts', title: 'Accounts', render: () => <AccountsSettings /> },
  { id: 'ai', title: 'AI review', render: () => <AiReviewSettings /> },
  { id: 'keymap', title: 'Keymap', render: () => <KeymapSettings /> },
];

interface SettingsDialogProps {
  section: SettingsSection;
  onSectionChange(section: SettingsSection): void;
  onClose(): void;
}

export function SettingsDialog({ section, onSectionChange, onClose }: SettingsDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const current = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0];
  useSuspendShortcuts();

  useEffect(() => {
    if (dialog.current && !dialog.current.open) {
      dialog.current.showModal();
    }
  }, []);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="settings-title"
      onClose={onClose}
    >
      <nav className={styles.nav} aria-label="Settings sections">
        <h2 id="settings-title" className={styles.title}>
          Settings
        </h2>
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.navItem}
            aria-current={item.id === current?.id ? 'page' : undefined}
            onClick={() => onSectionChange(item.id)}
          >
            {item.title}
          </button>
        ))}
      </nav>
      <div className={styles.content}>
        <header className={styles.header}>
          <h3 className={styles.sectionTitle}>{current?.title}</h3>
          <IconButton label="Close settings" onClick={() => dialog.current?.close()}>
            <X size={14} />
          </IconButton>
        </header>
        <div className={styles.body}>{current?.render()}</div>
      </div>
    </dialog>
  );
}
