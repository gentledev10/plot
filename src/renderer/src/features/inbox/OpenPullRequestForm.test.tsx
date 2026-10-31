import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OpenPullRequestForm } from './OpenPullRequestForm';

function setup() {
  const onOpen = vi.fn();
  render(<OpenPullRequestForm onOpen={onOpen} />);
  return { onOpen, input: screen.getByRole('textbox', { name: 'Pull request URL' }) };
}

describe('OpenPullRequestForm', () => {
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

  it('explains the expected format for anything else and keeps the text', async () => {
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
