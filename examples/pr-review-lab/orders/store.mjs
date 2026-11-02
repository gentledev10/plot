export function createOrderStore() {
  const orders = new Map();
  return {
    find(key) {
      return orders.get(key);
    },
    save(key, order) {
      const saved = { ...order, id: `demo-order-${orders.size + 1}` };
      orders.set(key, saved);
      return saved;
    },
    get size() {
      return orders.size;
    },
  };
}
