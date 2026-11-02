import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expected } from '../contracts/expectations.mjs';
import { canReserve, release, reserve } from '../inventory/reservations.mjs';

test('남은 재고 전체를 예약할 수 있음', () => {
  assert.equal(canReserve(2, 2), true);
});
test('주문 수량 상한과 잘못된 값을 거부', () => {
  assert.equal(canReserve(100, expected.maxQuantity), true);
  for (const count of [0, -1, 1.5, expected.maxQuantity + 1])
    assert.equal(canReserve(100, count), false);
});
test('결제 실패 후 재고를 원래대로 반환', () => {
  const inventory = new Map([['demo-book', 6]]);
  const reservation = reserve(inventory, 'demo-book', 2);
  assert.equal(inventory.get('demo-book'), 4);
  release(inventory, reservation);
  assert.equal(inventory.get('demo-book'), 6);
});

test('조회 이후 재고가 바뀌었다면 예약을 거부', () => {
  const inventory = new Map([['demo-book', 8]]);
  assert.deepEqual(reserve(inventory, 'demo-book', 2, { expectedAvailable: 9 }), {
    error: 409,
    reason: 'STALE_INVENTORY',
  });
  assert.equal(inventory.get('demo-book'), 8);
});
