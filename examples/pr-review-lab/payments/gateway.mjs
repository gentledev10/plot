// An in-memory fake: this module never contacts a payment provider.
export function createGateway(responses = [{ ok: true, status: 200 }]) {
  const charges = [];
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    get charges() {
      return charges.map((charge) => ({ ...charge }));
    },
    async charge(amount, key) {
      const response = responses[Math.min(calls, responses.length - 1)];
      calls += 1;
      if (response.throwCode) {
        const error = new Error('Simulated payment transport failure');
        error.code = response.throwCode;
        throw error;
      }
      const charge = { ...response, amount, key, chargeId: `demo-charge-${calls}` };
      charges.push(charge);
      return charge;
    },
  };
}
