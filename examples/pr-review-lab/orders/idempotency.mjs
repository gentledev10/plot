export function orderKey(customerId, cartId, cartVersion) {
  return `${customerId}:${cartId}:${cartVersion}`;
}
