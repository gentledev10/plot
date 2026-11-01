import { ChevronRight, Maximize2, Minimize2, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { IconButton } from '../../components/IconButton';
import { AccountsSettings } from '../accounts/AccountsSettings';
import { AiReviewSettings } from '../ai/AiReviewSettings';
import { AppearanceSettings } from '../appearance/AppearanceSettings';
import { useSuspendShortcuts } from '../keymap/KeymapProvider';
import { KeymapSettings } from '../keymap/KeymapSettings';
import { useT } from '../language/LanguageProvider';
import { LanguageSettings } from '../language/LanguageSettings';
import { ReviewFormatSettings } from '../review/ReviewFormatSettings';
import { useReviewPlan } from '../review/ReviewPlanProvider';
import styles from './SettingsDialog.module.css';
export type SettingsSection =
  | 'accounts'
  | 'ai'
  | 'appearance'
  | 'keymap'
  | 'language'
  | 'review-format';
interface SettingsItem {
  id: SettingsSection;
  title: string;
  render(): ReactNode;
  children?: readonly SettingsItem[];
}
const SECTIONS: readonly SettingsItem[] = [
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
    children: [
      { id: 'review-format', title: 'Review format', render: () => <ReviewFormatSettings /> },
    ],
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
  const { flush } = useReviewPlan();
  const close = () => {
    void flush()
      .then(() => dialog.current?.close())
      .catch(() => onSectionChange('review-format'));
  };
  const dialog = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(false);
  const normalSize = useRef({
    width: '',
    height: '',
  });
  const parent = SECTIONS.find((item) => item.children?.some((child) => child.id === section));
  const current =
    parent?.children?.find((item) => item.id === section) ??
    SECTIONS.find((item) => item.id === section) ??
    SECTIONS[0];
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
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <nav className={styles.nav} aria-label={t('Settings sections')}>
        <h2 id="settings-title" className={styles.title}>
          {t('Settings')}
        </h2>
        <ul className={styles.navList}>
          {SECTIONS.map((item) => (
            <li key={item.id}>
              {navigationButton(item, parent?.id === item.id)}
              {item.children && (
                <ul
                  className={styles.navChildren}
                  aria-label={t('{section} settings', { section: t(item.title) })}
                >
                  {item.children.map((child) => (
                    <li key={child.id}>{navigationButton(child)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <div className={styles.content}>
        <header className={styles.header}>
          <h3
            className={styles.sectionTitle}
            aria-label={
              parent ? `${t(parent.title)} / ${t(current?.title ?? 'Settings')}` : undefined
            }
          >
            {parent && (
              <span className={styles.parentTitle}>
                {t(parent.title)}
                <ChevronRight size={13} aria-hidden="true" />
              </span>
            )}
            {t(current?.title ?? 'Settings')}
          </h3>
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
            <IconButton label={t('Close settings')} onClick={close}>
              <X size={14} />
            </IconButton>
          </div>
        </header>
        <div className={styles.body}>{current?.render()}</div>
      </div>
    </dialog>
  );
  function navigationButton(item: SettingsItem, activeBranch = false) {
    return (
      <button
        type="button"
        className={styles.navItem}
        data-active-branch={activeBranch}
        aria-current={item.id === current?.id ? 'page' : undefined}
        onClick={() => onSectionChange(item.id)}
      >
        {t(item.title)}
      </button>
    );
  }
}
