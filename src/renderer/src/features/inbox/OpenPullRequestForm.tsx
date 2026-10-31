import type { PullRequestRef } from '@shared/github';
import { parsePullRequestRef } from '@shared/pull-request-ref';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import styles from './InboxPanel.module.css';

interface OpenPullRequestFormProps {
  onOpen(ref: PullRequestRef): void;
  focus?: boolean;
  onFocused?(): void;
}

export function OpenPullRequestForm({ onOpen, focus, onFocused }: OpenPullRequestFormProps) {
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();

  useEffect(() => {
    if (focus) {
      input.current?.focus();
      onFocused?.();
    }
  }, [focus, onFocused]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const ref = parsePullRequestRef(value);
    if (!ref) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setValue('');
    onOpen(ref);
  }

  return (
    <form className={styles.openForm} onSubmit={submit}>
      <input
        ref={input}
        className={styles.openInput}
        aria-label="Pull request URL"
        placeholder="Paste a pull request URL"
        value={value}
        spellCheck={false}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        onChange={(event) => {
          setValue(event.target.value);
          setInvalid(false);
        }}
      />
      {invalid && (
        <p id={errorId} className={styles.openError} role="alert">
          Use a link like https://github.com/owner/repo/pull/123 or owner/repo#123.
        </p>
      )}
    </form>
  );
}
