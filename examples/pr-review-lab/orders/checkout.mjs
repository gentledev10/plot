import { canCheckout } from '../access/permissions.mjs';
import { release, reserve } from '../inventory/reservations.mjs';
import { quotePrice } from '../pricing/quote.mjs';
import { shippingFee } from '../shipping/quote.mjs';
import { orderKey } from './idempotency.mjs';

export async function checkout(input, services) {
  const { store, inventory, gateway, recorder } = services;
  const key = orderKey(input.customerId, input.cartId, input.cartVersion);
  const existing = store.find(key);
  if (existing) return existing;
  if (!canCheckout(input.role, input.ownerMatches, input.state)) return { error: 403 };
  const price = quotePrice(input.amount, input.member, input.coupon);
  if (price.error) return price;
  const shipping = shippingFee(input.amount, input.member, input.shippingOk);
  if (shipping.error) return shipping;
  const reservation = reserve(inventory, input.sku, input.quantity);
  if (reservation.error) return reservation;
  const charge = await gateway.charge(price.payable + shipping.fee, key);
  if (!charge.ok) {
    release(inventory, reservation);
    return { error: charge.status };
  }
  const order = store.save(key, {
    key,
    amount: price.payable + shipping.fee,
    chargeId: charge.chargeId,
  });
  recorder.emit('order.completed', { orderId: order.id });
  return order;
}
