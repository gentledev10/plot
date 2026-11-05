import type { PullRequestRef } from '@shared/github';
import { pullRequestKey } from '@shared/pull-request-ref';
import type { ReviewUnit } from '@shared/review-unit';
import { useT } from '../language/LanguageProvider';
import { useReviewReading } from './ReviewReadingProvider';
import styles from './ReviewScope.module.css';

export function ReviewScope({
  target,
  head,
  units,
}: {
  target: PullRequestRef;
  head: string;
  units: readonly ReviewUnit[];
}) {
  const t = useT();
  const reading = useReviewReading();
  const key = pullRequestKey(target);
  const focus =
    reading.focus?.target === key && reading.focus.head === head ? reading.focus : undefined;
  const unit = focus?.mode === 'unit' ? units.find((unit) => unit.id === focus.unitId) : undefined;
  return (
    <label className={styles.scope}>
      <span>{t('Scope')}</span>
      <select
        value={unit ? `unit:${unit.id}` : 'all'}
        onChange={(event) => {
          const selected = units.find((unit) => `unit:${unit.id}` === event.target.value);
          reading.select({
            target: key,
            head,
            mode: selected ? 'unit' : 'all',
            unitId: selected?.id,
            paths: selected?.files.map((file) => file.path),
          });
        }}
      >
        <option value="all">{t('Whole PR')}</option>
        {units.map((unit, index) => (
          <option key={unit.id} value={`unit:${unit.id}`}>
            {index + 1}. {unit.title}
          </option>
        ))}
      </select>
    </label>
  );
}
