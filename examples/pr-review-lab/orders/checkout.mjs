import { canCheckout } from '../access/permissions.mjs';
import { release, reserve } from '../inventory/reservations.mjs';
import { eventNames } from '../observability/events.mjs';
import { paymentFailure } from '../payments/errors.mjs';
import { withPaymentRetry } from '../payments/retry.mjs';
import { quotePrice } from '../pricing/quote.mjs';
import { shippingFee } from '../shipping/quote.mjs';
import { orderKey } from './idempotency.mjs';
import { validateRequest } from './request.mjs';

export async function checkout(input, services) {
  const { store, inventory, gateway, recorder } = services;
  const invalid = validateRequest(input);
  if (invalid) return invalid;
  if (!canCheckout(input.role, input.ownerMatches, input.state)) {
    recorder.emit(eventNames.rejected, { reason: 'PERMISSION' });
    return { error: 403 };
  }
  const key = orderKey(input.customerId, input.cartId, input.cartVersion);
  const existing = store.find(key);
  if (existing) {
    recorder.emit(eventNames.reused, { orderId: existing.id });
    return existing;
  }
  const price = quotePrice(input.amount, input.member, input.coupon);
  if (price.error) return price;
  const shipping = shippingFee(input.amount, input.member, input.shippingOk);
  if (shipping.error) return shipping;
  const reservation = reserve(inventory, input.sku, input.quantity, {
    expectedAvailable: input.expectedStock,
  });
  if (reservation.error) return reservation;
  const total = price.payable + shipping.fee;
  let charge;
  try {
    charge = await withPaymentRetry(
      () => gateway.charge(total, key),
      (retry) => recorder.emit(eventNames.retried, { key, ...retry }),
    );
  } catch (error) {
    release(inventory, reservation);
    recorder.emit(eventNames.released, { sku: input.sku, quantity: input.quantity });
    return paymentFailure(error);
  }
  if (!charge.ok) {
    release(inventory, reservation);
    recorder.emit(eventNames.released, { sku: input.sku, quantity: input.quantity });
    return { error: charge.status };
  }
  const order = store.save(key, {
    key,
    amount: total,
    chargeId: charge.chargeId,
    attempts: charge.attempts,
  });
  recorder.emit(eventNames.completed, {
    orderId: order.id,
    discount: price.discount,
    shipping: shipping.fee,
  });
  return order;
}
