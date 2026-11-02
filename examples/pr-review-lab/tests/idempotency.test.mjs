import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request, services } from '../fixtures/scenarios.mjs';
import { checkout } from '../orders/checkout.mjs';
import { orderKey } from '../orders/idempotency.mjs';

test('같은 장바구니 버전은 같은 중복 방지 키', () => {
  assert.equal(orderKey('u', 'c', 1), orderKey('u', 'c', 1));
});
test('다른 장바구니 버전은 다른 중복 방지 키', () => {
  assert.notEqual(orderKey('u', 'c', 1), orderKey('u', 'c', 2));
});
test('같은 요청을 반복해도 한 번만 결제', async () => {
  const deps = services();
  const first = await checkout(request(), deps);
  const second = await checkout(request(), deps);
  assert.equal(first.id, second.id);
  assert.equal(deps.gateway.calls, 1);
});
