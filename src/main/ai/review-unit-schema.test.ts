import { retryUnit } from '@shared/review-unit.fixture';
import { describe, expect, it } from 'vitest';
import { parseReviewMap } from './review-schema';
import { linkReviewUnits, parseReviewUnits } from './review-unit-schema';

describe('reading units', () => {
  it('groups implementations and tests without trusting unsafe paths, ranges or duplicate ids', () => {
    const raw = retryUnit();
    const first = raw.files[0];
    if (first) raw.files.push({ ...first, path: '../secrets' });
    const [unit] = parseReviewUnits([raw, raw]);
    expect(unit?.files.map((file) => file.path)).toEqual(['src/retry.ts', 'src/retry.test.ts']);
    expect(unit?.files[0]?.ranges).toEqual([{ startLine: 4, endLine: 8 }]);
    expect(parseReviewUnits([raw, raw])).toHaveLength(1);
    expect(parseReviewUnits([{ ...raw, id: '<script>' }])).toEqual([]);
  });
  it('links only existing analysis and real changed files, leaving unassigned files visible', () => {
    const unit = retryUnit();
    unit.changeTitles.push('Invented change');
    unit.visualTitles = ['Invented diagram'];
    const review = parseReviewMap({
      summary: 's',
      changes: [{ title: 'Temporary failures', before: 'stop', after: 'retry' }],
      units: [unit],
    });
    const result = linkReviewUnits(review, new Set(['src/retry.ts']));
    expect(result.units?.[0]?.changeTitles).toEqual(['Temporary failures']);
    expect(result.units?.[0]?.visualTitles).toEqual([]);
    expect(result.units?.[0]?.files).toHaveLength(1);
  });
  it('does not require units in legacy saved reviews', () => {
    expect(parseReviewMap({ summary: 'Old review' })).not.toHaveProperty('units');
  });
});
