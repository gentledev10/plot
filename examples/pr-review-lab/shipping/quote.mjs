import { policy } from '../config/policy.mjs';

export function shippingFee(amount, member = false, serviceOk = true) {
  if (serviceOk !== true) return { error: 503 };
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return { error: 400 };
  if (member === true && amount >= policy.shipping.memberFree) return { fee: 0 };
  if (amount >= policy.shipping.standardFree) return { fee: 0 };
  return { fee: policy.shipping.fee };
}
