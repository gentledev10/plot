import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGateway } from '../payments/gateway.mjs';
import { attemptLimit, shouldRetry, withPaymentRetry } from '../payments/retry.mjs';

test('서버 장애만 일시적인 실패로 분류', () => {
  assert.equal(shouldRetry(503), true);
  assert.equal(shouldRetry(402), false);
  assert.equal(shouldRetry(403), false);
});
test('기본 시도 횟수는 한 번', async () => {
  const gateway = createGateway([{ ok: false, status: 503 }]);
  await withPaymentRetry(() => gateway.charge(3000, 'demo-key'));
  assert.equal(gateway.calls, attemptLimit());
});
