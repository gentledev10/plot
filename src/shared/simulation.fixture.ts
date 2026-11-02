import type { ReviewSimulation, ScenarioNode, ScenarioValue } from './simulation';

export function shippingSimulation(): ReviewSimulation {
  const condition = (
    id: string,
    label: string,
    input: string,
    operator: 'eq' | 'gte' | 'is-number',
    value: ScenarioValue,
    yes: string,
    no: string,
  ): ScenarioNode => ({
    id,
    label,
    kind: 'condition',
    input,
    operator,
    value,
    yes,
    no,
    location: { path: 'src/shipping.ts', line: 4 },
  });
  const nodes = (threshold: number): ScenarioNode[] => [
    condition('authorized', 'Authorized?', 'authorized', 'eq', true, 'service', 'denied'),
    condition('service', 'Service available?', 'serviceOk', 'eq', true, 'numeric', 'unavailable'),
    condition('numeric', 'Amount is a number?', 'amount', 'is-number', null, 'positive', 'invalid'),
    condition('positive', 'Amount is non-negative?', 'amount', 'gte', 0, 'threshold', 'invalid'),
    condition('threshold', `Amount >= ${threshold}?`, 'amount', 'gte', threshold, 'free', 'paid'),
    { id: 'denied', label: 'Permission denied', kind: 'error', value: 403 },
    { id: 'unavailable', label: 'Service unavailable', kind: 'error', value: 503 },
    { id: 'invalid', label: 'Invalid amount', kind: 'error', value: 400 },
    { id: 'free', label: 'Free shipping', kind: 'return', value: 0 },
    { id: 'paid', label: 'Shipping fee', kind: 'return', value: 3000 },
  ];
  const values = (amount: ScenarioValue, serviceOk = true, authorized = true) => [
    { id: 'amount', value: amount },
    { id: 'serviceOk', value: serviceOk },
    { id: 'authorized', value: authorized },
  ];
  return {
    id: 'shipping',
    changeTitle: 'Shipping threshold',
    title: 'Try shipping inputs',
    scope: 'Illustrative fixture. Shipping fee only; payment and service internals are omitted.',
    inputs: [
      { id: 'amount', label: 'Order amount', kind: 'number', default: 40000 },
      { id: 'serviceOk', label: 'Service available', kind: 'boolean', default: true },
      { id: 'authorized', label: 'Authorized', kind: 'boolean', default: true },
    ],
    before: { entry: 'authorized', nodes: nodes(50000) },
    after: { entry: 'authorized', nodes: nodes(30000) },
    cases: [
      {
        id: 'normal',
        label: 'Regular order',
        category: 'normal',
        question: 'How does the fee change?',
        inputs: values(40000),
      },
      {
        id: 'below',
        label: 'Below the new threshold',
        category: 'boundary',
        question: 'What happens just below?',
        inputs: values(29999),
      },
      {
        id: 'at',
        label: 'At the new threshold',
        category: 'boundary',
        question: 'Is the boundary inclusive?',
        inputs: values(30000),
      },
      {
        id: 'old',
        label: 'At the old threshold',
        category: 'boundary',
        question: 'Does the old case still work?',
        inputs: values(50000),
      },
      {
        id: 'missing',
        label: 'Missing amount',
        category: 'invalid-input',
        question: 'How is missing input handled?',
        inputs: values(null),
      },
      {
        id: 'negative',
        label: 'Negative amount',
        category: 'invalid-input',
        question: 'How are negative values handled?',
        inputs: values(-1),
      },
      {
        id: 'offline',
        label: 'Service outage',
        category: 'dependency-failure',
        question: 'Which failure is exposed?',
        inputs: values(40000, false),
      },
      {
        id: 'denied',
        label: 'Unauthorized',
        category: 'permission',
        question: 'Is authorization checked first?',
        inputs: values(40000, true, false),
      },
    ],
  };
}
