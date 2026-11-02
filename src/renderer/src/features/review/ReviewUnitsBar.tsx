import type { ReviewUnit } from '@shared/review-unit';
import { useT } from '../language/LanguageProvider';
import styles from './ReviewUnitsBar.module.css';

export function ReviewUnitsBar({
  units,
  selected,
  remaining,
  linked,
  total,
  onSelect,
}: {
  units: ReviewUnit[];
  selected: string;
  remaining: number;
  linked: number;
  total: number;
  onSelect(value: string): void;
}) {
  const t = useT();
  const index = units.findIndex((unit) => `unit:${unit.id}` === selected);
  return (
    <div className={styles.bar}>
      <div className={styles.controls}>
        <label>
          {t('Read by change')}
          <select value={selected} onChange={(event) => onSelect(event.target.value)}>
            <option value="all">{t('All files and review steps')}</option>
            {units.map((unit, i) => (
              <option key={unit.id} value={`unit:${unit.id}`}>
                {i + 1}. {unit.title}
              </option>
            ))}
            {remaining > 0 && (
              <option value="remaining">{t('Other files ({count})', { count: remaining })}</option>
            )}
          </select>
        </label>
        <button
          type="button"
          disabled={index <= 0}
          onClick={() => {
            const unit = units[index - 1];
            if (unit) onSelect(`unit:${unit.id}`);
          }}
        >
          {t('Previous change')}
        </button>
        <button
          type="button"
          disabled={index < 0 || index >= units.length - 1}
          onClick={() => {
            const unit = units[index + 1];
            if (unit) onSelect(`unit:${unit.id}`);
          }}
        >
          {t('Next change')}
        </button>
      </div>
      <span className={styles.coverage}>
        {t(
          'Reading units link {linked} of {total} changed files. This does not measure AI inspection.',
          { linked, total },
        )}
      </span>
    </div>
  );
}
