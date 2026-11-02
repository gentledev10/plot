import { policy } from '../config/policy.mjs';

export function canReserve(available, requested) {
  if (!Number.isInteger(available) || !Number.isInteger(requested)) return false;
  if (available < 0 || requested < 1 || requested > policy.inventory.maxPerOrder) return false;
  return available >= requested;
}

export function reserve(inventory, sku, quantity) {
  const available = inventory.get(sku) ?? 0;
  if (!canReserve(available, quantity)) return { error: 409 };
  inventory.set(sku, available - quantity);
  return { sku, quantity };
}

export function release(inventory, reservation) {
  inventory.set(reservation.sku, (inventory.get(reservation.sku) ?? 0) + reservation.quantity);
}
