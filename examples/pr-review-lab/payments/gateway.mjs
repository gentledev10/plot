// An in-memory fake: this module never contacts a payment provider.
export function createGateway(responses = [{ ok: true, status: 200 }]) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async charge(amount, key) {
      const response = responses[Math.min(calls, responses.length - 1)];
      calls += 1;
      return { ...response, amount, key, chargeId: `demo-charge-${calls}` };
    },
  };
}
