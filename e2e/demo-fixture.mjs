// Illustrative repository and saved overview for documentation captures. No live AI call.
export const before = {
  'src/notifications/deliver.ts': `import { provider } from './provider';

export interface Notification {
  id: string;
  recipient: string;
  message: string;
}

export async function deliver(event: Notification) {
  const response = await provider.send({
    to: event.recipient,
    text: event.message,
  });

  if (!response.ok) {
    throw new Error('Notification delivery failed');
  }

  return { id: event.id, status: 'delivered' };
}
`,
  'src/notifications/provider.ts': `export const provider = {
  async send(input: {
    to: string;
    text: string;
    idempotencyKey?: string;
  }) {
    return fetch('https://notifications.example/send', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};
`,
  'README.md': '# Notification service\nDelivers notifications through an HTTP provider.\n',
};
export const after = {
  ...before,
  'src/notifications/deliver.ts': `import { provider } from './provider';
import { withRetry } from './retry';

export interface Notification {
  id: string;
  recipient: string;
  message: string;
}

export async function deliver(event: Notification) {
  const response = await withRetry(() => provider.send({
    to: event.recipient,
    text: event.message,
    idempotencyKey: event.id,
  }));

  if (!response.ok) {
    throw new Error('Notification delivery failed');
  }

  return { id: event.id, status: 'delivered' };
}
`,
  'src/notifications/retry.ts': `const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

export async function withRetry(
  send: () => Promise<Response>,
) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const response = await send();
    const transient = response.status >= 500;

    if (!transient || attempt === MAX_ATTEMPTS - 1) {
      return response;
    }

    const delay = BASE_DELAY_MS * 2 ** attempt;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  throw new Error('Retry attempts exhausted');
}
`,
  'src/notifications/retry.test.ts': `import { expect, it, vi } from 'vitest';
import { withRetry } from './retry';

it('retries transient failures', async () => {
  vi.useFakeTimers();
  const send = vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));

  const pending = withRetry(send);
  await vi.runAllTimersAsync();

  expect((await pending).status).toBe(200);
  expect(send).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});
`,
};
const location = (path, line) => ({ path: `src/notifications/${path}`, line });
const oldGraph = {
  groups: [
    { id: 'service', label: 'Notification service' },
    { id: 'external', label: 'Delivery provider' },
  ],
  nodes: [
    { id: 'deliver', label: 'deliver()', status: 'unchanged', group: 'service', evidence: 'code' },
    {
      id: 'provider',
      label: 'HTTP provider',
      status: 'unchanged',
      group: 'external',
      evidence: 'code',
    },
  ],
  edges: [{ from: 'deliver', to: 'provider', label: 'Send once', evidence: 'code' }],
};
const newGraph = {
  groups: oldGraph.groups,
  nodes: [
    {
      id: 'deliver',
      label: 'deliver()',
      status: 'changed',
      group: 'service',
      evidence: 'code',
      location: location('deliver.ts', 10),
    },
    {
      id: 'retry',
      label: 'Retry policy',
      status: 'added',
      group: 'service',
      evidence: 'code',
      location: location('retry.ts', 4),
    },
    {
      id: 'provider',
      label: 'HTTP provider',
      status: 'unchanged',
      group: 'external',
      evidence: 'code',
      location: location('provider.ts', 1),
    },
  ],
  edges: [
    { from: 'deliver', to: 'retry', label: 'Stable event ID', evidence: 'code' },
    { from: 'retry', to: 'provider', label: 'Up to 3 attempts', evidence: 'code' },
  ],
};
export const overview = {
  summary:
    'Notifications now retry temporary provider failures up to three times. Each attempt reuses the event ID as an idempotency key; permanent failures return immediately.',
  changes: [
    {
      title: 'Retry only temporary failures',
      before: 'A single 503 response stops delivery.',
      after: 'Server errors retry with exponential backoff.',
      location: location('retry.ts', 7),
    },
    {
      title: 'Keep the same delivery identity',
      before: 'Requests have no idempotency key.',
      after: 'Every attempt sends the original event ID.',
      location: location('deliver.ts', 14),
    },
  ],
  flows: [],
  architecture: newGraph,
  visuals: [
    {
      kind: 'components',
      title: 'A retry boundary around delivery',
      takeaway: 'The retry policy sits between the notification service and the HTTP provider.',
      scope:
        'Illustrative example: delivery, retry policy, provider adapter and test inspected. Provider-side deduplication is not verified.',
      before: oldGraph,
      after: newGraph,
    },
  ],
  impacts: [],
  reviewPoints: [
    {
      title: 'Verify provider-side deduplication',
      reason: 'The client supplies a stable key; actual deduplication depends on the provider.',
      check: 'Confirm how long the provider retains keys.',
      evidence: 'inferred',
      location: location('deliver.ts', 14),
    },
    {
      title: 'Add coverage for network exceptions',
      reason: 'Only HTTP responses with a 5xx status are retried.',
      check: 'Decide whether thrown network errors should retry.',
      evidence: 'code',
      location: location('retry.ts', 8),
    },
  ],
  readingOrder: [
    { path: 'src/notifications/deliver.ts', reason: 'Start with the stable event identity.' },
    { path: 'src/notifications/retry.ts', reason: 'Inspect retry conditions and backoff.' },
    { path: 'src/notifications/retry.test.ts', reason: 'Check the transient failure test.' },
  ],
};
