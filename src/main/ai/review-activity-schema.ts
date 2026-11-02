import type { CodeLocation } from '@shared/review';
import type { VerificationFinding } from '@shared/review-activity';

const text = { type: 'string' } as const;
const object = <T extends Record<string, unknown>>(properties: T) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const location = object({ path: text, line: { type: 'integer' } });
export const ANSWER_SCHEMA = object({
  answer: text,
  locations: { type: 'array', items: location },
});
export const FINDINGS_SCHEMA = object({
  summary: text,
  findings: {
    type: 'array',
    items: object({
      id: text,
      title: text,
      severity: { type: 'string', enum: ['high', 'medium', 'low'] },
      reason: text,
      check: text,
      location: { anyOf: [location, { type: 'null' }] },
    }),
  },
});
export const VERIFICATION_SCHEMA = object({
  findings: {
    type: 'array',
    items: object({
      id: text,
      verdict: { type: 'string', enum: ['supported', 'dismissed', 'uncertain'] },
      reason: text,
    }),
  },
});
export const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export const prose = (value: unknown, limit = 8000) =>
  typeof value === 'string' ? value.trim().slice(0, limit) : '';
export function parseActivityLocation(
  raw: unknown,
  lines: ReadonlyMap<string, number>,
): CodeLocation | undefined {
  if (
    !record(raw) ||
    typeof raw.path !== 'string' ||
    !Number.isInteger(raw.line) ||
    Number(raw.line) < 1
  )
    return;
  const count = lines.get(raw.path);
  if (count === undefined || Number(raw.line) > count) return;
  return { path: raw.path, line: Number(raw.line), verified: true };
}
export function parseFindings(
  raw: unknown,
  lines: ReadonlyMap<string, number>,
): VerificationFinding[] {
  if (!record(raw) || !Array.isArray(raw.findings)) return [];
  const result: VerificationFinding[] = [];
  for (const item of raw.findings.slice(0, 8)) {
    if (
      !record(item) ||
      !prose(item.id, 64) ||
      !prose(item.title, 200) ||
      !prose(item.reason) ||
      result.some((v) => v.id === item.id)
    )
      continue;
    result.push({
      id: prose(item.id, 64),
      title: prose(item.title, 200),
      severity: ['high', 'medium', 'low'].includes(String(item.severity))
        ? (item.severity as VerificationFinding['severity'])
        : 'low',
      reason: prose(item.reason, 2000),
      check: prose(item.check, 2000),
      location: parseActivityLocation(item.location, lines),
      verdict: 'uncertain',
      verificationReason: '',
    });
  }
  return result;
}
