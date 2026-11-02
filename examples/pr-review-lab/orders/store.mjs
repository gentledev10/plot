export function createOrderStore() {
  const orders = new Map();
  return {
    find(key) {
      const found = orders.get(key);
      return found ? { ...found } : undefined;
    },
    save(key, order) {
      const saved = { ...order, id: `demo-order-${orders.size + 1}`, state: 'paid' };
      orders.set(key, saved);
      return { ...saved };
    },
    get size() {
      return orders.size;
    },
  };
}
