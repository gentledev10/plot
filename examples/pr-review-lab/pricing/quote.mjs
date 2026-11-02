import { policy } from '../config/policy.mjs';

export function discountPercent(member, coupon) {
  return member ? policy.pricing.memberPercent : 0;
}

export function quotePrice(amount, member = false, coupon = false) {
  if (!Number.isInteger(amount) || amount < 0) return { error: 400 };
  const percent = discountPercent(member, coupon);
  const discount = Math.floor((amount * percent) / 100);
  return { subtotal: amount, discount, payable: amount - discount };
}
