export function validateRequest(input) {
  if (!input || !Number.isInteger(input.amount) || input.amount < 0) return { error: 400 };
  if (!input.customerId || !input.cartId || !input.sku) return { error: 400 };
  if (!Number.isInteger(input.cartVersion) || input.cartVersion < 1) return { error: 400 };
  if (!Number.isInteger(input.quantity) || input.quantity < 1) return { error: 400 };
  return null;
}
