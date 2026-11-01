import type { RepositoryRef } from '@shared/github';
import { GITHUB_HOST } from '@shared/hosts';
import { formatRepositoryRef, repositoryKey } from '@shared/repository-ref';
import { type FormEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import styles from './AddRepositoryPopover.module.css';
import { useFindRepository, useRepositoryChoices } from './queries';
import { hasRepository, repositoryOptions } from './repository-list';

interface AddRepositoryPopoverProps {
  anchor: HTMLElement | null;
  existing: readonly RepositoryRef[];
  accountId: string;
  defaultHost: string;
  onAdd(ref: RepositoryRef): void;
  onClose(): void;
}

export function AddRepositoryPopover({
  anchor,
  existing,
  accountId,
  defaultHost,
  onAdd,
  onClose,
}: AddRepositoryPopoverProps) {
  const popover = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const inputId = useId();
  const hintId = useId();
  const [text, setText] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [error, setError] = useState<string>();
  const choices = useRepositoryChoices(accountId, true);
  const find = useFindRepository();
  const { typed, suggestions } = repositoryOptions(text, choices.data ?? [], defaultHost);
  const options = typed ? [typed, ...suggestions] : suggestions;
  const active = Math.min(highlight, options.length - 1);

  useEffect(() => {
    const element = popover.current;
    if (!element) {
      return;
    }
    const onToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === 'closed') {
        close.current();
      }
    };
    element.addEventListener('toggle', onToggle);
    element.showPopover({ source: anchor ?? undefined } as ShowPopoverOptions);
    input.current?.focus();
    return () => element.removeEventListener('toggle', onToggle);
  }, [anchor]);

  function choose(ref: RepositoryRef | undefined) {
    if (!ref) {
      setError('Type owner/repo, or paste a repository URL.');
      return;
    }
    if (hasRepository(existing, ref)) {
      setError(`${formatRepositoryRef(ref)} is already in the list.`);
      return;
    }
    setError(undefined);
    find.mutate(ref, {
      onSuccess: (found) => {
        onAdd(found);
        onClose();
      },
      onError: (failure) => setError(failure.message),
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    choose(options[active]);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight(Math.max(0, Math.min(options.length - 1, active + step)));
    } else if (event.key === 'Escape') {
      onClose();
    }
  }

  function hint(): string {
    if (error) {
      return error;
    }
    if (find.isPending && find.variables) {
      return `Checking ${formatRepositoryRef(find.variables)}…`;
    }
    return 'Type owner/repo, or paste a repository URL.';
  }

  function option(ref: RepositoryRef, index: number, label: string) {
    const added = hasRepository(existing, ref);
    return (
      <li key={repositoryKey(ref)}>
        <button
          type="button"
          className={styles.option}
          data-highlighted={index === active}
          disabled={added || find.isPending}
          onClick={() => choose(ref)}
        >
          <span className={styles.name}>{label}</span>
          {added && <span className={styles.added}>Added</span>}
        </button>
      </li>
    );
  }

  return (
    <div ref={popover} popover="auto" className={styles.popover}>
      <form onSubmit={submit}>
        <label className={styles.hidden} htmlFor={inputId}>
          Repository to add
        </label>
        <input
          ref={input}
          id={inputId}
          className={styles.input}
          type="text"
          value={text}
          placeholder="owner/repo"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={hintId}
          aria-invalid={error !== undefined}
          onChange={(event) => {
            setText(event.target.value);
            setHighlight(0);
            setError(undefined);
          }}
          onKeyDown={onKeyDown}
        />
      </form>
      <p id={hintId} className={styles.hint} data-error={error !== undefined}>
        {hint()}
      </p>
      <ul className={styles.options}>
        {typed && option(typed, 0, `Add ${formatRepositoryRef(typed)}`)}
      </ul>
      <p className={styles.label}>
        {choices.isError
          ? `Could not load your repositories. ${choices.error.message}`
          : `Your repositories on ${defaultHost === GITHUB_HOST ? 'GitHub' : defaultHost}`}
      </p>
      {choices.isPending ? (
        <p className={styles.loading}>Loading…</p>
      ) : (
        <ul className={styles.options}>
          {suggestions.map((ref, index) =>
            option(ref, typed ? index + 1 : index, formatRepositoryRef(ref)),
          )}
        </ul>
      )}
    </div>
  );
}
