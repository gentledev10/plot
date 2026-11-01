import { Maximize2, Minimize2, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { IconButton } from '../../components/IconButton';
import { AccountsSettings } from '../accounts/AccountsSettings';
import { AiReviewSettings } from '../ai/AiReviewSettings';
import { AppearanceSettings } from '../appearance/AppearanceSettings';
import { useSuspendShortcuts } from '../keymap/KeymapProvider';
import { KeymapSettings } from '../keymap/KeymapSettings';
import { useT } from '../language/LanguageProvider';
import { LanguageSettings } from '../language/LanguageSettings';
import styles from './SettingsDialog.module.css';
export type SettingsSection = 'accounts' | 'ai' | 'appearance' | 'keymap' | 'language';
const SECTIONS: readonly {
  id: SettingsSection;
  title: string;
  render(): ReactNode;
}[] = [
  {
    id: 'language',
    title: 'Language',
    render: () => <LanguageSettings />,
  },
  {
    id: 'accounts',
    title: 'Accounts',
    render: () => <AccountsSettings />,
  },
  {
    id: 'ai',
    title: 'AI overview',
    render: () => <AiReviewSettings />,
  },
  {
    id: 'appearance',
    title: 'Appearance',
    render: () => <AppearanceSettings />,
  },
  {
    id: 'keymap',
    title: 'Keymap',
    render: () => <KeymapSettings />,
  },
];
interface SettingsDialogProps {
  section: SettingsSection;
  onSectionChange(section: SettingsSection): void;
  onClose(): void;
}
export function SettingsDialog({ section, onSectionChange, onClose }: SettingsDialogProps) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(false);
  const normalSize = useRef({
    width: '',
    height: '',
  });
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
      data-expanded={expanded}
      style={
        expanded
          ? {
              width: 'calc(100vw - 32px)',
              height: 'calc(100vh - 32px)',
            }
          : normalSize.current
      }
      aria-labelledby="settings-title"
      onClose={onClose}
    >
      <nav className={styles.nav} aria-label={t('Settings sections')}>
        <h2 id="settings-title" className={styles.title}>
          {t('Settings')}
        </h2>
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.navItem}
            aria-current={item.id === current?.id ? 'page' : undefined}
            onClick={() => onSectionChange(item.id)}
          >
            {t(item.title)}
          </button>
        ))}
      </nav>
      <div className={styles.content}>
        <header className={styles.header}>
          <h3 className={styles.sectionTitle}>{t(current?.title ?? 'Settings')}</h3>
          <div className={styles.windowActions}>
            <IconButton
              label={expanded ? t('Restore settings size') : t('Expand settings')}
              onClick={() => {
                if (!expanded && dialog.current) {
                  const { width, height } = dialog.current.style;
                  normalSize.current = {
                    width,
                    height,
                  };
                }
                setExpanded(!expanded);
              }}
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </IconButton>
            <IconButton label={t('Close settings')} onClick={() => dialog.current?.close()}>
              <X size={14} />
            </IconButton>
          </div>
        </header>
        <div className={styles.body}>{current?.render()}</div>
      </div>
    </dialog>
  );
}
