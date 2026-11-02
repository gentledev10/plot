export const eventNames = Object.freeze({
  completed: 'order.completed',
  rejected: 'order.rejected',
  retried: 'payment.retried',
  released: 'inventory.released',
  reused: 'order.reused',
});

export function createEventRecorder() {
  const events = [];
  return {
    emit(name, data = {}) {
      if (!Object.values(eventNames).includes(name)) throw new Error('Unknown audit event');
      events.push({ name, data: { ...data } });
    },
    get events() {
      return events.map((event) => ({ ...event, data: { ...event.data } }));
    },
  };
}
