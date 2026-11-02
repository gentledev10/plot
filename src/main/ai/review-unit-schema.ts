import type { ReviewMap } from '@shared/review';
import type { ReviewRange, ReviewUnit, ReviewUnitFile } from '@shared/review-unit';

const text = { type: 'string' } as const;
const strings = { type: 'array', items: text } as const;
const range = {
  type: 'object',
  properties: { startLine: { type: 'integer' }, endLine: { type: 'integer' } },
  required: ['startLine', 'endLine'],
  additionalProperties: false,
} as const;
export const REVIEW_UNITS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: text,
      title: text,
      summary: text,
      rationale: text,
      rationaleEvidence: { type: 'string', enum: ['code', 'description', 'inferred'] },
      files: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: text,
            role: {
              type: 'string',
              enum: ['implementation', 'test', 'configuration', 'documentation', 'other'],
            },
            reason: text,
            ranges: { type: 'array', items: range },
            beforeRanges: { type: 'array', items: range },
          },
          required: ['path', 'role', 'reason', 'ranges', 'beforeRanges'],
          additionalProperties: false,
        },
      },
      changeTitles: strings,
      visualTitles: strings,
      simulationIds: strings,
      reviewPointTitles: strings,
    },
    required: [
      'id',
      'title',
      'summary',
      'rationale',
      'rationaleEvidence',
      'files',
      'changeTitles',
      'visualTitles',
      'simulationIds',
      'reviewPointTitles',
    ],
    additionalProperties: false,
  },
} as const;

type Json = Record<string, unknown>;
const object = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const prose = (v: unknown, limit: number) =>
  typeof v === 'string' ? v.trim().slice(0, limit) : '';
function ranges(raw: unknown): ReviewRange[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(object)
    .filter(
      (v) =>
        Number.isInteger(v.startLine) &&
        Number.isInteger(v.endLine) &&
        Number(v.startLine) > 0 &&
        Number(v.endLine) >= Number(v.startLine) &&
        Number(v.endLine) <= 1_000_000,
    )
    .slice(0, 8)
    .map((v) => ({ startLine: Number(v.startLine), endLine: Number(v.endLine) }));
}
function titles(raw: unknown): string[] {
  return Array.isArray(raw)
    ? [
        ...new Set(
          raw.filter((v): v is string => typeof v === 'string').map((v) => v.trim().slice(0, 200)),
        ),
      ].slice(0, 15)
    : [];
}
export function parseReviewUnits(raw: unknown): ReviewUnit[] {
  if (!Array.isArray(raw)) return [];
  const result: ReviewUnit[] = [];
  for (const item of raw.slice(0, 12)) {
    if (
      !object(item) ||
      typeof item.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) ||
      !prose(item.title, 200) ||
      !prose(item.summary, 2000) ||
      !Array.isArray(item.files) ||
      result.some((unit) => unit.id === item.id)
    )
      continue;
    const files: ReviewUnitFile[] = [];
    for (const file of item.files.slice(0, 24)) {
      if (!object(file) || typeof file.path !== 'string') continue;
      const path = file.path.trim().replace(/^\.\//, '');
      if (
        !path ||
        path.length > 4096 ||
        /[\\\0]/.test(path) ||
        path.startsWith('/') ||
        path.split('/').includes('..') ||
        !['implementation', 'test', 'configuration', 'documentation', 'other'].includes(
          String(file.role),
        ) ||
        files.some((entry) => entry.path === path)
      )
        continue;
      files.push({
        path,
        role: file.role as ReviewUnitFile['role'],
        reason: prose(file.reason, 500),
        ranges: ranges(file.ranges),
        beforeRanges: ranges(file.beforeRanges),
      });
    }
    if (!files.length) continue;
    result.push({
      id: item.id,
      title: prose(item.title, 200),
      summary: prose(item.summary, 2000),
      rationale: prose(item.rationale, 1600),
      rationaleEvidence: ['code', 'description', 'inferred'].includes(
        String(item.rationaleEvidence),
      )
        ? (item.rationaleEvidence as ReviewUnit['rationaleEvidence'])
        : 'inferred',
      files,
      changeTitles: titles(item.changeTitles),
      visualTitles: titles(item.visualTitles),
      simulationIds: titles(item.simulationIds),
      reviewPointTitles: titles(item.reviewPointTitles),
    });
  }
  return result;
}

export function linkReviewUnits(review: ReviewMap, changedPaths?: ReadonlySet<string>): ReviewMap {
  if (!review.units) return review;
  const known = (values: readonly string[], candidates: readonly string[]) =>
    values.filter((value) => candidates.includes(value));
  return {
    ...review,
    units: review.units
      .map((unit) => ({
        ...unit,
        files: unit.files.filter((file) => !changedPaths || changedPaths.has(file.path)),
        changeTitles: known(
          unit.changeTitles,
          review.changes.map((v) => v.title),
        ),
        visualTitles: known(unit.visualTitles, review.visuals?.map((v) => v.title) ?? []),
        simulationIds: known(unit.simulationIds, review.simulations?.map((v) => v.id) ?? []),
        reviewPointTitles: known(
          unit.reviewPointTitles,
          review.reviewPoints?.map((v) => v.title) ?? [],
        ),
      }))
      .filter((unit) => unit.files.length > 0),
  };
}
