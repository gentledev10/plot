import { policy } from '../config/policy.mjs';

export function shouldRetry(status) {
  return Number.isInteger(status) && status >= 500 && status <= 599;
}

export async function withPaymentRetry(send, onRetry = () => {}) {
  const result = await send();
  return result;
}

export function attemptLimit() {
  return policy.payment.maxAttempts;
}
