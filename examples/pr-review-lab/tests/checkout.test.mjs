import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request, services } from '../fixtures/scenarios.mjs';
import { checkout } from '../orders/checkout.mjs';

test('정상 주문은 재고와 주문 및 감사 이벤트를 함께 반영', async () => {
  const deps = services();
  const order = await checkout(request(), deps);
  assert.ok(order.id);
  assert.equal(deps.inventory.get('demo-book'), 10);
  assert.equal(deps.store.size, 1);
  assert.equal(deps.recorder.events.at(-1).name, 'order.completed');
});
test('권한 거부 시 외부 호출과 재고 변경 없음', async () => {
  const deps = services();
  assert.deepEqual(await checkout(request({ ownerMatches: false }), deps), { error: 403 });
  assert.equal(deps.gateway.calls, 0);
  assert.equal(deps.inventory.get('demo-book'), 12);
});
test('확정 결제 실패 시 재고 반환', async () => {
  const deps = services([{ ok: false, status: 402 }]);
  assert.deepEqual(await checkout(request(), deps), { error: 402 });
  assert.equal(deps.inventory.get('demo-book'), 12);
});
