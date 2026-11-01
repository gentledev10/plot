import type { LocalCompare, LocalDiff, LocalRepository } from '@shared/local';
import { createTranslator } from '@shared/translations';
import { GitBranch, HardDrive } from 'lucide-react';
import { useId } from 'react';
import { useLocalDiff } from '../diff/queries';
import { useT } from '../language/LanguageProvider';
import styles from './LocalHeader.module.css';

interface LocalHeaderProps {
  repository?: LocalRepository;
  repositoryId: string;
  compare: LocalCompare;
  onCompareChange(compare: LocalCompare): void;
}
const COMPARES: readonly {
  id: LocalCompare;
  label: string;
}[] = [
  {
    id: 'branch',
    label: 'Branch changes',
  },
  {
    id: 'uncommitted',
    label: 'Uncommitted only',
  },
];
export function LocalHeader({
  repository,
  repositoryId,
  compare,
  onCompareChange,
}: LocalHeaderProps) {
  const t = useT();
  const diff = useLocalDiff({
    repositoryId,
    compare,
  });
  const groupName = useId();
  return (
    <header className={styles.header}>
      <div className={styles.meta}>
        <span className={styles.badge}>
          <HardDrive size={12} />
          {t(' Local')}
        </span>
        <span className={styles.path} title={repository?.path}>
          {repository?.path}
        </span>
      </div>
      <h1 className={styles.title}>{repository?.name ?? t('Local repository')}</h1>
      <div className={styles.details}>
        {diff.data && (
          <span className={styles.branch}>
            <GitBranch size={13} />
            {diff.data.branch ?? t('Detached HEAD')}
          </span>
        )}
        {diff.data && <span>{describeBase(compare, diff.data.base, t)}</span>}
        <fieldset className={styles.compare}>
          <legend className={styles.hidden}>{t('Changes to show')}</legend>
          {COMPARES.map((option) => (
            <label key={option.id} className={styles.option}>
              <input
                type="radio"
                name={groupName}
                checked={compare === option.id}
                onChange={() => onCompareChange(option.id)}
              />
              {t(option.label)}
            </label>
          ))}
        </fieldset>
      </div>
    </header>
  );
}
export function describeBase(
  compare: LocalCompare,
  base: LocalDiff['base'],
  t = createTranslator('en'),
): string {
  if (!base) {
    return t('No commits yet, so every file is new.');
  }
  if (compare === 'branch' && base.name !== 'HEAD') {
    return t('Compared with {name} at {commit}, including uncommitted work.', {
      name: base.name,
      commit: base.commit.slice(0, 7),
    });
  }
  return t('Compared with the last commit, {commit}.', { commit: base.commit.slice(0, 7) });
}
