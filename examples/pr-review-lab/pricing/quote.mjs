import { policy } from '../config/policy.mjs';

export function discountPercent(member, coupon) {
  const memberPercent = member ? policy.pricing.memberPercent : 0;
  const couponPercent = coupon ? policy.pricing.couponPercent : 0;
  return Math.min(policy.pricing.maxPercent, memberPercent + couponPercent);
}

export function quotePrice(amount, member = false, coupon = false) {
  if (!Number.isInteger(amount) || amount < 0) return { error: 400 };
  const percent = discountPercent(member, coupon);
  const discount = Math.floor((amount * percent) / 100);
  return { subtotal: amount, discount, percent, payable: amount - discount };
}
