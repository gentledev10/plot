import type { PullRequestRef } from '@shared/github';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PullRequestSearch } from './PullRequestSearch';

function Search({
  firstMatch,
  onOpen,
}: {
  firstMatch?: PullRequestRef;
  onOpen(ref: PullRequestRef): void;
}) {
  const [query, setQuery] = useState('');
  return (
    <PullRequestSearch
      query={query}
      onQueryChange={setQuery}
      firstMatch={firstMatch}
      onOpen={onOpen}
    />
  );
}

function setup(firstMatch?: PullRequestRef) {
  const onOpen = vi.fn();
  render(<Search firstMatch={firstMatch} onOpen={onOpen} />);
  return { onOpen, input: screen.getByRole('searchbox', { name: 'Find or open a pull request' }) };
}

describe('PullRequestSearch', () => {
  it('opens a pasted pull request URL and clears the field', async () => {
    const { onOpen, input } = setup();

    await userEvent.type(input, 'https://github.com/octocat/hello-world/pull/42/files{Enter}');

    expect(onOpen).toHaveBeenCalledWith({
      host: 'github.com',
      owner: 'octocat',
      repo: 'hello-world',
      number: 42,
    });
    expect(input).toHaveValue('');
  });

  it('accepts the owner/repo#number shorthand', async () => {
    const { onOpen, input } = setup();
    await userEvent.type(input, 'octocat/hello-world#7{Enter}');
    expect(onOpen).toHaveBeenCalledWith({
      host: 'github.com',
      owner: 'octocat',
      repo: 'hello-world',
      number: 7,
    });
  });

  it('opens the first pull request that matches what was typed, keeping the filter', async () => {
    const match = { host: 'github.com', owner: 'acme', repo: 'api', number: 12 };
    const { onOpen, input } = setup(match);

    await userEvent.type(input, 'login{Enter}');

    expect(onOpen).toHaveBeenCalledWith(match);
    expect(input).toHaveValue('login');
  });

  it('explains how to open a pull request when nothing matches, and keeps the text', async () => {
    const { onOpen, input } = setup();

    await userEvent.type(input, 'https://github.com/octocat/hello-world/issues/1{Enter}');

    expect(onOpen).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('github.com/owner/repo/pull/123');
    expect(input).toHaveValue('https://github.com/octocat/hello-world/issues/1');
  });

  it('clears the error as soon as the text changes', async () => {
    const { input } = setup();

    await userEvent.type(input, 'nope{Enter}');
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await userEvent.type(input, 'x');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });
});
