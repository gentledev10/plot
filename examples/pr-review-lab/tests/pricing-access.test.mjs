import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canCheckout } from '../access/permissions.mjs';
import { expected } from '../contracts/expectations.mjs';
import { discountPercent, quotePrice } from '../pricing/quote.mjs';

test('회원 할인율은 정책을 따름', () => {
  assert.equal(discountPercent(true, false), expected.memberDiscount);
});
test('할인 뒤 금액은 음수가 되지 않음', () => {
  for (const amount of [0, 1, 100, 100000]) assert.ok(quotePrice(amount, true, true).payable >= 0);
});
test('다른 소유자의 주문과 잘못된 상태를 거부', () => {
  assert.equal(canCheckout('member', false, 'draft'), false);
  assert.equal(canCheckout('guest', true, 'draft'), false);
  assert.equal(canCheckout('member', true, 'paid'), false);
});
test('본인 초안 주문과 관리자 주문은 허용', () => {
  assert.equal(canCheckout('member', true, 'draft'), true);
  assert.equal(canCheckout('admin', false, 'draft'), true);
});
