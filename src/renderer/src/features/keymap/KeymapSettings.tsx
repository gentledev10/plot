import { Plus, RotateCcw, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { IconButton } from '../../components/IconButton';
import { COMMAND_GROUPS, COMMANDS, type Command, type CommandId, commandTitle } from './commands';
import { useKeymap } from './KeymapProvider';
import styles from './KeymapSettings.module.css';
import {
  assignStroke,
  type Bindings,
  findConflict,
  isCustomized,
  removeStroke,
  resetCommand,
} from './keymap';
import { formatStroke, type StrokeProblem, strokeFromEvent, strokeProblem } from './keystroke';

export function KeymapSettings() {
  const { bindings, overrides, setOverrides, platform } = useKeymap();
  const [recording, setRecording] = useState<CommandId>();
  const format = (stroke: string) => formatStroke(stroke, platform);

  return (
    <div className={styles.keymap}>
      <div className={styles.intro}>
        <p>
          The defaults follow IntelliJ IDEA. Find ({format('Meta+F')}), find next (
          {format('Meta+G')}), and copy ({format('Meta+C')}) come with the code editor.
        </p>
        <button
          type="button"
          className={styles.secondary}
          disabled={Object.keys(overrides).length === 0}
          onClick={() => setOverrides({})}
        >
          Reset all
        </button>
      </div>
      {COMMAND_GROUPS.map((group) => (
        <section key={group} className={styles.group} aria-label={group}>
          <h4 className={styles.groupTitle}>{group}</h4>
          <ul className={styles.list}>
            {COMMANDS.filter((command) => command.group === group).map((command) => (
              <CommandRow
                key={command.id}
                command={command}
                bindings={bindings}
                customized={isCustomized(overrides, command.id)}
                recording={recording === command.id}
                format={format}
                onRecord={() => setRecording(command.id)}
                onCancel={() => setRecording(undefined)}
                onAssign={(stroke) => {
                  setOverrides(assignStroke(overrides, command.id, stroke));
                  setRecording(undefined);
                }}
                onRemove={(stroke) => setOverrides(removeStroke(overrides, command.id, stroke))}
                onReset={() => setOverrides(resetCommand(overrides, command.id))}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

interface CommandRowProps {
  command: Command;
  bindings: Bindings;
  customized: boolean;
  recording: boolean;
  format(stroke: string): string;
  onRecord(): void;
  onCancel(): void;
  onAssign(stroke: string): void;
  onRemove(stroke: string): void;
  onReset(): void;
}

function CommandRow({
  command,
  bindings,
  customized,
  recording,
  format,
  onRecord,
  onCancel,
  onAssign,
  onRemove,
  onReset,
}: CommandRowProps) {
  const strokes = bindings[command.id];
  return (
    <li className={styles.row}>
      <span className={styles.command}>{command.title}</span>
      <span className={styles.keys}>
        {strokes.length === 0 && !recording && <span className={styles.none}>None</span>}
        {strokes.map((stroke) => (
          <span key={stroke} className={styles.key}>
            <kbd>{format(stroke)}</kbd>
            <button
              type="button"
              className={styles.removeKey}
              aria-label={`Remove ${format(stroke)} from ${command.title}`}
              title="Remove"
              onClick={() => onRemove(stroke)}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {recording ? (
          <ShortcutRecorder
            command={command}
            bindings={bindings}
            format={format}
            onAssign={onAssign}
            onCancel={onCancel}
          />
        ) : (
          <IconButton label={`Add a shortcut for ${command.title}`} onClick={onRecord}>
            <Plus size={14} />
          </IconButton>
        )}
        {customized && !recording && (
          <IconButton label={`Reset ${command.title}`} onClick={onReset}>
            <RotateCcw size={13} />
          </IconButton>
        )}
      </span>
    </li>
  );
}

interface ShortcutRecorderProps {
  command: Command;
  bindings: Bindings;
  format(stroke: string): string;
  onAssign(stroke: string): void;
  onCancel(): void;
}

function ShortcutRecorder({
  command,
  bindings,
  format,
  onAssign,
  onCancel,
}: ShortcutRecorderProps) {
  const field = useRef<HTMLButtonElement>(null);
  const [problem, setProblem] = useState<string>();
  const [conflict, setConflict] = useState<{ stroke: string; owner: CommandId }>();

  useEffect(() => field.current?.focus(), []);

  function record(event: KeyboardEvent) {
    const plain = !event.metaKey && !event.ctrlKey && !event.altKey;
    if (event.key === 'Tab' && plain) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape' && plain && !event.shiftKey) {
      onCancel();
      return;
    }
    const stroke = strokeFromEvent(event.nativeEvent);
    if (stroke === undefined) {
      return;
    }
    const issue = strokeProblem(stroke);
    if (issue) {
      setConflict(undefined);
      setProblem(describeProblem(issue, format(stroke)));
      return;
    }
    const owner = findConflict(bindings, stroke, command.id);
    if (owner) {
      setProblem(undefined);
      setConflict({ stroke, owner });
      return;
    }
    onAssign(stroke);
  }

  return (
    <span className={styles.recorder}>
      <button
        ref={field}
        type="button"
        className={styles.field}
        aria-label={`Press the new shortcut for ${command.title}`}
        onKeyDown={record}
      >
        {conflict ? format(conflict.stroke) : 'Press keys…'}
      </button>
      {problem && (
        <span className={styles.problem} role="alert">
          {problem}
        </span>
      )}
      {conflict && (
        <span className={styles.problem} role="alert">
          Used by {commandTitle(conflict.owner)}.{' '}
          <button type="button" className={styles.link} onClick={() => onAssign(conflict.stroke)}>
            Reassign
          </button>
        </span>
      )}
      <button type="button" className={styles.link} onClick={onCancel}>
        Cancel
      </button>
    </span>
  );
}

function describeProblem(problem: StrokeProblem, shortcut: string): string {
  if (problem.kind === 'reserved') {
    return `${shortcut} ${problem.use}, so it cannot be changed here.`;
  }
  return 'Add ⌘, ⌃, or ⌥, so the shortcut does not get in the way of typing.';
}
