import { describe, expect, it } from 'vitest';
import { aPullRequestSummary, aUser } from '../../../test/builders';
import { filterPullRequests, groupByRepository } from './grouping';

function pull(number: number, repo: string, updatedAt: string, host = 'github.com') {
  const [owner = '', name = ''] = repo.split('/');
  return aPullRequestSummary(number, {
    ref: { host, owner, repo: name, number },
    updatedAt,
  });
}

describe('groupByRepository', () => {
  it('puts the repository with the latest activity first, newest pull request first', () => {
    const groups = groupByRepository([
      pull(1, 'acme/api', '2026-10-01T00:00:00Z'),
      pull(2, 'acme/web', '2026-10-03T00:00:00Z'),
      pull(3, 'acme/api', '2026-10-02T00:00:00Z'),
    ]);

    expect(groups.map((group) => group.name)).toEqual(['acme/web', 'acme/api']);
    expect(groups[1]?.pulls.map((item) => item.ref.number)).toEqual([3, 1]);
  });

  it('keeps repositories on other servers apart and names them with the server', () => {
    const groups = groupByRepository([
      pull(1, 'acme/api', '2026-10-01T00:00:00Z'),
      pull(2, 'acme/api', '2026-10-02T00:00:00Z', 'github.example.com'),
    ]);

    expect(groups.map((group) => group.name)).toEqual(['github.example.com/acme/api', 'acme/api']);
  });

  it('treats repository names that differ only in case as one repository', () => {
    const groups = groupByRepository([
      pull(1, 'Acme/API', '2026-10-01T00:00:00Z'),
      pull(2, 'acme/api', '2026-10-02T00:00:00Z'),
    ]);
    expect(groups).toHaveLength(1);
  });
});

describe('filterPullRequests', () => {
  const pulls = [
    aPullRequestSummary(12, {
      ref: { host: 'github.com', owner: 'acme', repo: 'api', number: 12 },
      title: 'Fix login redirect',
      author: aUser('mona'),
    }),
    aPullRequestSummary(7, {
      ref: { host: 'github.com', owner: 'acme', repo: 'web', number: 7 },
      title: 'Add dark mode',
      author: aUser('hubot'),
    }),
  ];
  const numbers = (query: string) =>
    filterPullRequests(pulls, query).map((item) => item.ref.number);

  it('matches the repository, number, title, and author, ignoring case', () => {
    expect(numbers('ACME/API')).toEqual([12]);
    expect(numbers('#7')).toEqual([7]);
    expect(numbers('dark')).toEqual([7]);
    expect(numbers('mona')).toEqual([12]);
  });

  it('needs every word to match somewhere', () => {
    expect(numbers('web dark')).toEqual([7]);
    expect(numbers('web login')).toEqual([]);
  });

  it('keeps everything when there is nothing to look for', () => {
    expect(numbers('  ')).toEqual([12, 7]);
  });
});
