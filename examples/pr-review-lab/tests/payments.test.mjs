import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGateway } from '../payments/gateway.mjs';
import { attemptLimit, shouldRetry, withPaymentRetry } from '../payments/retry.mjs';

test('재시도 대상은 429와 서버 장애만 포함', () => {
  assert.equal(shouldRetry(429), true);
  assert.equal(shouldRetry(503), true);
  for (const status of [400, 401, 402, 403, 409]) assert.equal(shouldRetry(status), false);
});
test('일시적 장애는 세 번까지 시도', async () => {
  const gateway = createGateway([{ ok: false, status: 503 }]);
  await withPaymentRetry(() => gateway.charge(3000, 'demo-key'));
  assert.equal(gateway.calls, attemptLimit());
  assert.equal(gateway.calls, 3);
});
test('429 뒤 성공하면 남은 재시도는 중단', async () => {
  const gateway = createGateway([
    { ok: false, status: 429 },
    { ok: true, status: 200 },
  ]);
  const result = await withPaymentRetry(() => gateway.charge(3000, 'demo-key'));
  assert.equal(result.ok, true);
  assert.equal(gateway.calls, 2);
});
