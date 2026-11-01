import type { PullRequestRef } from '@shared/github';
import { parsePullRequestRef } from '@shared/pull-request-ref';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { useT } from '../language/LanguageProvider';
import styles from './InboxPanel.module.css';

interface PullRequestSearchProps {
  query: string;
  onQueryChange(query: string): void;
  firstMatch?: PullRequestRef;
  defaultHost?: string;
  onOpen(ref: PullRequestRef): void;
  focus?: boolean;
  onFocused?(): void;
}
export function PullRequestSearch({
  query,
  onQueryChange,
  firstMatch,
  defaultHost,
  onOpen,
  focus,
  onFocused,
}: PullRequestSearchProps) {
  const t = useT();
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
    const ref = parsePullRequestRef(query, defaultHost);
    if (ref) {
      onQueryChange('');
      onOpen(ref);
    } else if (firstMatch) {
      onOpen(firstMatch);
    } else {
      setInvalid(true);
    }
  }
  return (
    <form className={styles.searchForm} onSubmit={submit}>
      <input
        ref={input}
        type="search"
        className={styles.searchInput}
        aria-label={t('Find or open a pull request')}
        placeholder={t('Filter, or paste a pull request URL')}
        value={query}
        spellCheck={false}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setInvalid(false);
        }}
      />
      {invalid && (
        <p id={errorId} className={styles.searchError} role="alert">
          {t(
            'No pull request matches. To open another one, paste a link like https://github.com/owner/repo/pull/123 or owner/repo#123.',
          )}
        </p>
      )}
    </form>
  );
}
