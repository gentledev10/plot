export function createEventRecorder() {
  const events = [];
  return {
    emit(name, data = {}) {
      events.push({ name, data: { ...data } });
    },
    get events() {
      return events.map((event) => ({ ...event, data: { ...event.data } }));
    },
  };
}
