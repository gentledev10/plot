import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { aPullRequestSummary } from '../../../test/builders';
import { renderWithApi } from '../../../test/render';
import { LocalPullRequestLink } from './LocalPullRequestLink';

const ref = { host: 'github.com', owner: 'acme', repo: 'api', number: 7 };

describe('LocalPullRequestLink', () => {
  it('opens the pull request of the checked-out branch', async () => {
    const onOpen = vi.fn();
    renderWithApi(<LocalPullRequestLink repositoryId="0123456789abcdef" onOpen={onOpen} />, {
      getLocalStatus: vi.fn().mockResolvedValue({ branch: 'retry', changedFiles: 1 }),
      findLocalPullRequest: vi
        .fn()
        .mockResolvedValue(aPullRequestSummary(7, { ref, title: 'Retry webhooks' })),
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Pull request #7' }));
    expect(onOpen).toHaveBeenCalledWith(ref);
  });

  it('shows nothing without a branch or a pull request', async () => {
    const findLocalPullRequest = vi.fn().mockResolvedValue(null);
    const { container } = renderWithApi(
      <LocalPullRequestLink repositoryId="0123456789abcdef" onOpen={vi.fn()} />,
      {
        getLocalStatus: vi.fn().mockResolvedValue({ branch: null, changedFiles: 0 }),
        findLocalPullRequest,
      },
    );

    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(findLocalPullRequest).not.toHaveBeenCalled();
  });
});
