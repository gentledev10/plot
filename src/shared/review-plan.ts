export const REVIEW_PLAN_PREFERENCE = 'review-plan';
export const MAX_CUSTOM_STEPS = 6;
const ANALYSIS_VERSION = 3;
export const BUILTIN_STEPS = [
  {
    id: 'summary',
    title: 'At a glance',
    description: 'The purpose and effect in two or three sentences.',
  },
  {
    id: 'architecture',
    title: 'Change map',
    description: 'Where this change sits in the wider system.',
  },
  {
    id: 'changes',
    title: 'Key changes',
    description: 'The important differences, before and after.',
  },
  {
    id: 'reviewPoints',
    title: 'Review focus',
    description: 'Conditions, exceptions and tests worth checking, with evidence.',
  },
  {
    id: 'readingOrder',
    title: 'Code walkthrough',
    description: 'The first few files to inspect and why.',
  },
  { id: 'flows', title: 'Execution flows', description: 'Diagrams showing how behavior changes.' },
  {
    id: 'impacts',
    title: 'What else it affects',
    description: 'Effects on callers, data, configuration and performance.',
  },
] as const;
const DEFAULT_IDS = ['summary', 'architecture', 'changes', 'reviewPoints', 'readingOrder'] as const;
const LEGACY_IDS = ['summary', 'changes', 'flows', 'architecture', 'impacts', 'readingOrder'];
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
  version?: 2;
  steps: ReviewStep[];
}
export const defaultReviewPlan = (): ReviewPlan => ({
  version: 2,
  steps: DEFAULT_IDS.map((id) => ({
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
  if (
    !('version' in value) &&
    value.steps.length === LEGACY_IDS.length &&
    value.steps.every(
      (step, i) =>
        step &&
        step.id === LEGACY_IDS[i] &&
        step.kind === step.id &&
        step.title === '' &&
        step.instructions === '' &&
        step.visible === true &&
        step.detail === 'balanced' &&
        step.format === 'text',
    )
  )
    return defaults;
  const seen = new Set<string>();
  let custom = 0;
  const steps: ReviewStep[] = [];
  for (const raw of value.steps.slice(0, 30)) {
    if (!raw || typeof raw !== 'object') continue;
    const builtin = BUILTIN_STEPS.find(({ id }) => id === raw.id);
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
      kind: builtin?.id ?? 'custom',
      title: typeof raw.title === 'string' ? raw.title.slice(0, 100) : '',
      visible: raw.visible !== false,
      instructions: typeof raw.instructions === 'string' ? raw.instructions.slice(0, 1500) : '',
      detail: ['brief', 'balanced', 'detailed'].includes(raw.detail) ? raw.detail : 'balanced',
      format:
        !builtin && ['text', 'checklist', 'diagram'].includes(raw.format) ? raw.format : 'text',
    });
  }
  return { version: 2, steps };
}

export function applyRecommendedReviewPlan(plan: ReviewPlan): ReviewPlan {
  const defaults = defaultReviewPlan();
  const ids = new Set(defaults.steps.map((step) => step.id));
  return {
    version: 2,
    steps: [
      ...defaults.steps.map(
        (step) => plan.steps.find((existing) => existing.id === step.id) ?? step,
      ),
      ...plan.steps.filter(
        (step) =>
          !ids.has(step.id) &&
          (step.kind === 'custom' ||
            step.title.trim() ||
            step.instructions.trim() ||
            step.detail !== 'balanced' ||
            !step.visible),
      ),
    ],
  };
}

// Presentation changes reuse the same analysis. Sort by id so dragging never invalidates it.
export function reviewContentKey(plan: ReviewPlan): string {
  return JSON.stringify({
    analysisVersion: ANALYSIS_VERSION,
    steps: plan.steps
      .map((step) => ({
        id: step.id,
        kind: step.kind,
        instructions: step.instructions.trim(),
        detail: step.detail,
        ...(step.kind === 'custom' ? { title: stepTitle(step), format: step.format } : {}),
      }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  });
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
  return { version: 2, steps };
}
