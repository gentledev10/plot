export function orderKey(customerId, cartId, _cartVersion) {
  return `${customerId}:${cartId}`;
}
