import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expected } from '../contracts/expectations.mjs';
import { shippingFee } from '../shipping/quote.mjs';

test('무료 배송 기준 직전에는 배송비를 부과', () => {
  assert.deepEqual(shippingFee(expected.standardThreshold - 1), { fee: 3000 });
});
test('기준 금액부터 무료 배송', () => {
  assert.deepEqual(shippingFee(expected.standardThreshold), { fee: 0 });
});
test('회원 무료 배송 기준을 별도로 적용', () => {
  assert.deepEqual(shippingFee(expected.memberThreshold, true), { fee: 0 });
});
test('음수 금액은 오류로 반환', () => {
  assert.deepEqual(shippingFee(-1), { error: 400 });
});
test('잘못된 형식과 서비스 장애는 거부', () => {
  for (const amount of [null, '', '30000', false])
    assert.deepEqual(shippingFee(amount), { error: 400 });
  assert.deepEqual(shippingFee(50000, false, false), { error: 503 });
});

test('경계값 바로 위와 새 회원 기준 직전도 확인', () => {
  assert.deepEqual(shippingFee(expected.standardThreshold + 1), { fee: 0 });
  assert.deepEqual(shippingFee(expected.memberThreshold - 1, true), { fee: 3000 });
});
