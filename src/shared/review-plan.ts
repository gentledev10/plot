export const REVIEW_PLAN_PREFERENCE = 'review-plan';
export const MAX_CUSTOM_STEPS = 6;
export const BUILTIN_STEPS = [
  { id: 'summary', title: 'Summary', description: 'The purpose and overall effect of the change.' },
  {
    id: 'changes',
    title: 'What changed',
    description: 'The important differences, before and after.',
  },
  { id: 'flows', title: 'Execution flows', description: 'Diagrams showing how behavior changes.' },
  {
    id: 'architecture',
    title: 'Architecture',
    description: 'The components and their relationships.',
  },
  {
    id: 'impacts',
    title: 'What else it affects',
    description: 'Effects on callers, data, configuration and performance.',
  },
  {
    id: 'readingOrder',
    title: 'Where to start reading',
    description: 'An order for reading the changed files.',
  },
] as const;
export type BuiltinStep = (typeof BUILTIN_STEPS)[number]['id'];
export type ReviewDetail = 'brief' | 'balanced' | 'detailed';
export type ReviewFormat = 'text' | 'checklist' | 'diagram';
export interface ReviewStep {
  id: string;
  kind: BuiltinStep | 'custom';
  title: string;
  visible: boolean;
  instructions: string;
  detail: ReviewDetail;
  format: ReviewFormat;
}
export interface ReviewPlan {
  steps: ReviewStep[];
}
export const defaultReviewPlan = (): ReviewPlan => ({
  steps: BUILTIN_STEPS.map(({ id }) => ({
    id,
    kind: id,
    title: '',
    visible: true,
    instructions: '',
    detail: 'balanced',
    format: 'text',
  })),
});
export const isCustomStepId = (id: string) => /^custom_[a-zA-Z0-9-]{1,64}$/.test(id);
export const stepTitle = (step: ReviewStep) =>
  step.title.trim() || BUILTIN_STEPS.find(({ id }) => id === step.kind)?.title || 'Untitled step';

export function parseReviewPlan(value: unknown): ReviewPlan {
  const defaults = defaultReviewPlan();
  if (!value || typeof value !== 'object' || !('steps' in value) || !Array.isArray(value.steps))
    return defaults;
  const seen = new Set<string>();
  let custom = 0;
  const steps: ReviewStep[] = [];
  for (const raw of value.steps.slice(0, 30)) {
    if (!raw || typeof raw !== 'object') continue;
    const builtin = defaults.steps.find(({ id }) => id === raw.id);
    if (
      !builtin &&
      !(
        raw.kind === 'custom' &&
        typeof raw.id === 'string' &&
        isCustomStepId(raw.id) &&
        custom < MAX_CUSTOM_STEPS
      )
    )
      continue;
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);
    if (!builtin) custom++;
    steps.push({
      id: raw.id,
      kind: builtin?.kind ?? 'custom',
      title: typeof raw.title === 'string' ? raw.title.slice(0, 100) : '',
      visible: raw.visible !== false,
      instructions: typeof raw.instructions === 'string' ? raw.instructions.slice(0, 1500) : '',
      detail: ['brief', 'balanced', 'detailed'].includes(raw.detail) ? raw.detail : 'balanced',
      format:
        !builtin && ['text', 'checklist', 'diagram'].includes(raw.format) ? raw.format : 'text',
    });
  }
  return { steps };
}

// Presentation changes reuse the same analysis. Sort by id so dragging never invalidates it.
export function reviewContentKey(plan: ReviewPlan): string {
  return JSON.stringify(
    plan.steps
      .map((step) => ({
        id: step.id,
        kind: step.kind,
        instructions: step.instructions.trim(),
        detail: step.detail,
        ...(step.kind === 'custom' ? { title: stepTitle(step), format: step.format } : {}),
      }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  );
}

export function moveReviewStep(
  plan: ReviewPlan,
  id: string,
  target: string,
  after = false,
): ReviewPlan {
  if (id === target || !plan.steps.some((s) => s.id === target)) return plan;
  const step = plan.steps.find((s) => s.id === id);
  if (!step) return plan;
  const steps = plan.steps.filter((s) => s.id !== id);
  steps.splice(steps.findIndex((s) => s.id === target) + Number(after), 0, step);
  return { steps };
}
