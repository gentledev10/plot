import type { ChangedFile, FileStatus } from '@shared/diff';
import { ArrowDown, ArrowUp, Columns2, FoldVertical, Pilcrow, Rows2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useShortcutLabel, withShortcut } from '../keymap/KeymapProvider';
import { useT } from '../language/LanguageProvider';
import type { Direction } from './changes';
import styles from './DiffToolbar.module.css';
import type { ChangePosition, DiffSettings } from './DiffViewer';

interface DiffToolbarProps {
  file: ChangedFile;
  position?: ChangePosition;
  total?: number;
  hint?: string;
  settings: DiffSettings;
  onSettingsChange(settings: DiffSettings): void;
  onNavigate(direction: Direction): void;
}
const STATUS_LETTER: Record<FileStatus, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  'type-changed': 'T',
};
export function DiffToolbar({
  file,
  position,
  total,
  hint,
  settings,
  onSettingsChange,
  onNavigate,
}: DiffToolbarProps) {
  const t = useT();
  const nextShortcut = useShortcutLabel('diff.nextDifference');
  const previousShortcut = useShortcutLabel('diff.previousDifference');
  const slash = file.path.lastIndexOf('/');
  const directory = file.path.slice(0, slash + 1);
  const name = file.path.slice(slash + 1);
  return (
    <div className={styles.toolbar}>
      <div className={styles.row}>
        <span className={styles.status} data-status={file.status} title={t(file.status)}>
          {STATUS_LETTER[file.status]}
        </span>
        <span className={styles.path} title={file.path}>
          <span className={styles.directory}>{directory}</span>
          <span className={styles.name}>{name}</span>
          {file.previousPath && (
            <span className={styles.renamed}>
              {t('renamed from ')}
              {file.previousPath}
            </span>
          )}
        </span>
        <span className={styles.counter} aria-live="polite">
          {changeCounter(position, total, t)}
        </span>
        <ToolbarButton
          label={withShortcut(t('Previous difference'), previousShortcut)}
          onClick={() => onNavigate('previous')}
        >
          <ArrowUp size={14} />
        </ToolbarButton>
        <ToolbarButton
          label={withShortcut(t('Next difference'), nextShortcut)}
          onClick={() => onNavigate('next')}
        >
          <ArrowDown size={14} />
        </ToolbarButton>
        <span className={styles.separator} />
        <ToolbarButton
          label={t('Collapse unchanged fragments')}
          pressed={settings.collapseUnchanged}
          onClick={() =>
            onSettingsChange({
              ...settings,
              collapseUnchanged: !settings.collapseUnchanged,
            })
          }
        >
          <FoldVertical size={14} />
        </ToolbarButton>
        <ToolbarButton
          label={t('Ignore whitespace')}
          pressed={settings.ignoreWhitespace}
          onClick={() =>
            onSettingsChange({
              ...settings,
              ignoreWhitespace: !settings.ignoreWhitespace,
            })
          }
        >
          <Pilcrow size={14} />
        </ToolbarButton>
        <ToolbarButton
          label={
            settings.sideBySide ? t('Switch to unified view') : t('Switch to side-by-side view')
          }
          onClick={() =>
            onSettingsChange({
              ...settings,
              sideBySide: !settings.sideBySide,
            })
          }
        >
          {settings.sideBySide ? <Rows2 size={14} /> : <Columns2 size={14} />}
        </ToolbarButton>
      </div>
      {hint && (
        <p className={styles.hint} role="status">
          {hint}
        </p>
      )}
    </div>
  );
}
function changeCounter(
  position: ChangePosition | undefined,
  total: number | undefined,
  t: (s: string, v?: Record<string, string | number>) => string,
): string {
  if (total === undefined) {
    return '';
  }
  if (total === 0) {
    return t('No differences');
  }
  if (!position) {
    return t('{count} differences', { count: total });
  }
  return t('{index} of {total}', { index: position.index + 1, total: position.total });
}
interface ToolbarButtonProps {
  label: string;
  pressed?: boolean;
  onClick(): void;
  children: ReactNode;
}
function ToolbarButton({ label, pressed, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={styles.button}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
