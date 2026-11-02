import { policy } from '../config/policy.mjs';
import { isTransportFailure } from './errors.mjs';

export function shouldRetry(status) {
  return Number.isInteger(status) && status >= 400 && status <= 599;
}

export async function withPaymentRetry(send, onRetry = () => {}) {
  const limit = attemptLimit();
  for (let attempt = 1; attempt <= limit; attempt += 1) {
    let result;
    try {
      result = await send();
    } catch (error) {
      if (!isTransportFailure(error) || attempt === limit) throw error;
      onRetry({ attempt, reason: error.code });
      continue;
    }
    if (result.ok || !shouldRetry(result.status) || attempt === limit) {
      return { ...result, attempts: attempt };
    }
    onRetry({ attempt, reason: result.status });
  }
  throw new Error('Payment attempts exhausted');
}

export function attemptLimit() {
  return policy.payment.maxAttempts;
}
