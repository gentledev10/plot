import { createEventRecorder } from '../observability/events.mjs';
import { createOrderStore } from '../orders/store.mjs';
import { createGateway } from '../payments/gateway.mjs';

export function request(overrides = {}) {
  return {
    customerId: 'demo-customer',
    cartId: 'demo-cart',
    cartVersion: 1,
    role: 'member',
    ownerMatches: true,
    state: 'draft',
    amount: 40_000,
    member: false,
    coupon: false,
    shippingOk: true,
    sku: 'demo-book',
    quantity: 2,
    ...overrides,
  };
}

export function services(responses) {
  return {
    store: createOrderStore(),
    inventory: new Map([['demo-book', 12]]),
    gateway: createGateway(responses),
    recorder: createEventRecorder(),
  };
}

export const paymentScenarios = Object.freeze({
  temporaryFailure: [
    { ok: false, status: 503 },
    { ok: true, status: 200 },
  ],
  rateLimited: [
    { ok: false, status: 429 },
    { ok: true, status: 200 },
  ],
  declined: [{ ok: false, status: 402 }],
  timedOut: [{ throwCode: 'ETIMEDOUT' }],
});
