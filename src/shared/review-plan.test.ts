import { describe, expect, it } from 'vitest';
import {
  defaultReviewPlan,
  moveReviewStep,
  parseReviewPlan,
  reviewContentKey,
} from './review-plan';

describe('review plans', () => {
  it('restores built-in steps and rejects duplicate or unknown custom ids', () => {
    const plan = parseReviewPlan({
      steps: [
        { id: 'architecture', visible: false },
        { id: 'architecture' },
        { id: 'unknown', kind: 'custom' },
        { id: 'custom_safe', kind: 'custom', title: 'Tests', format: 'checklist' },
      ],
    });
    expect(plan.steps.map((s) => s.id)).toEqual([
      'architecture',
      'custom_safe',
      'summary',
      'changes',
      'flows',
      'impacts',
      'readingOrder',
    ]);
    expect(plan.steps[1]?.format).toBe('checklist');
    expect(parseReviewPlan(null)).toEqual(defaultReviewPlan());
  });
  it('bounds user input and custom count and keeps one card visible', () => {
    const steps = [
      ...defaultReviewPlan().steps,
      ...Array.from({ length: 9 }, (_, i) => ({
        id: `custom_${i}`,
        kind: 'custom',
        title: 'x'.repeat(200),
        instructions: 'y'.repeat(2000),
        format: 'html',
      })),
    ].map((s) => ({ ...s, visible: false }));
    const plan = parseReviewPlan({ steps });
    expect(plan.steps).toHaveLength(12);
    expect(plan.steps.filter((s) => s.visible)).toHaveLength(1);
    expect(plan.steps[6]).toMatchObject({
      title: 'x'.repeat(100),
      instructions: 'y'.repeat(1500),
      format: 'text',
    });
  });
  it('reuses analysis after ordering, visibility and built-in title changes', () => {
    const plan = defaultReviewPlan();
    const next = moveReviewStep(plan, 'architecture', 'summary');
    expect(next.steps[0]?.id).toBe('architecture');
    const first = next.steps[0];
    if (first) {
      first.visible = false;
      first.title = 'Start here';
    }
    expect(reviewContentKey(next)).toBe(reviewContentKey(plan));
    expect(moveReviewStep(plan, 'summary', 'readingOrder', true).steps.at(-1)?.id).toBe('summary');
  });
  it('marks new instructions, detail or custom content as needing analysis', () => {
    const plan = defaultReviewPlan();
    for (const patch of [
      { instructions: 'Explain failure paths' },
      { detail: 'detailed' as const },
    ]) {
      const next = { steps: plan.steps.map((s) => (s.id === 'summary' ? { ...s, ...patch } : s)) };
      expect(reviewContentKey(next)).not.toBe(reviewContentKey(plan));
    }
    const custom = parseReviewPlan({
      steps: [...plan.steps, { id: 'custom_tests', kind: 'custom', title: 'Tests' }],
    });
    const renamed = {
      steps: custom.steps.map((s) => (s.kind === 'custom' ? { ...s, title: 'Data migration' } : s)),
    };
    expect(reviewContentKey(custom)).not.toBe(reviewContentKey(plan));
    expect(reviewContentKey(custom)).not.toBe(reviewContentKey(renamed));
  });
});
