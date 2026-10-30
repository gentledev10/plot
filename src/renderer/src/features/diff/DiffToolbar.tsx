import type { ChangedFile, FileStatus } from '@shared/diff';
import { ArrowDown, ArrowUp, Columns2, FoldVertical, Pilcrow, Rows2 } from 'lucide-react';
import type { ReactNode } from 'react';
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
  const slash = file.path.lastIndexOf('/');
  const directory = file.path.slice(0, slash + 1);
  const name = file.path.slice(slash + 1);

  return (
    <div className={styles.toolbar}>
      <div className={styles.row}>
        <span className={styles.status} data-status={file.status} title={file.status}>
          {STATUS_LETTER[file.status]}
        </span>
        <span className={styles.path} title={file.path}>
          <span className={styles.directory}>{directory}</span>
          <span className={styles.name}>{name}</span>
          {file.previousPath && (
            <span className={styles.renamed}>renamed from {file.previousPath}</span>
          )}
        </span>
        <span className={styles.counter} aria-live="polite">
          {changeCounter(position, total)}
        </span>
        <ToolbarButton
          label="Previous difference (Shift+F7)"
          onClick={() => onNavigate('previous')}
        >
          <ArrowUp size={14} />
        </ToolbarButton>
        <ToolbarButton label="Next difference (F7)" onClick={() => onNavigate('next')}>
          <ArrowDown size={14} />
        </ToolbarButton>
        <span className={styles.separator} />
        <ToolbarButton
          label="Collapse unchanged fragments"
          pressed={settings.collapseUnchanged}
          onClick={() =>
            onSettingsChange({ ...settings, collapseUnchanged: !settings.collapseUnchanged })
          }
        >
          <FoldVertical size={14} />
        </ToolbarButton>
        <ToolbarButton
          label="Ignore whitespace"
          pressed={settings.ignoreWhitespace}
          onClick={() =>
            onSettingsChange({ ...settings, ignoreWhitespace: !settings.ignoreWhitespace })
          }
        >
          <Pilcrow size={14} />
        </ToolbarButton>
        <ToolbarButton
          label={settings.sideBySide ? 'Switch to unified view' : 'Switch to side-by-side view'}
          onClick={() => onSettingsChange({ ...settings, sideBySide: !settings.sideBySide })}
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

function changeCounter(position: ChangePosition | undefined, total: number | undefined): string {
  if (total === undefined) {
    return '';
  }
  if (total === 0) {
    return 'No differences';
  }
  if (!position) {
    return `${total} ${total === 1 ? 'difference' : 'differences'}`;
  }
  return `${position.index + 1} of ${position.total}`;
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
