import type { LocalCompare, LocalDiff, LocalRepository, LocalTarget } from '@shared/local';
import { createTranslator } from '@shared/translations';
import { GitBranch, HardDrive } from 'lucide-react';
import { useEffect, useId } from 'react';
import { StatusMessage } from '../../components/StatusMessage';
import { useLocalDiff } from '../diff/queries';
import { useT } from '../language/LanguageProvider';
import styles from './LocalHeader.module.css';
import { useLocalHistory } from './queries';

interface LocalHeaderProps {
  repository?: LocalRepository;
  target: LocalTarget;
  onTargetChange(target: LocalTarget): void;
}
const COMPARES: readonly { id: LocalCompare; label: string }[] = [
  { id: 'branch', label: 'Branch changes' },
  { id: 'uncommitted', label: 'Uncommitted only' },
  { id: 'commits', label: 'Selected commits' },
];
export function LocalHeader({ repository, target, onTargetChange }: LocalHeaderProps) {
  const t = useT();
  const diff = useLocalDiff(target);
  const history = useLocalHistory(target.repositoryId, target.headRef);
  const groupName = useId();
  const branches = history.data?.branches ?? [];
  const currentBranch = branches.find((branch) => branch.current)?.name;
  const workingHead = target.headRef === undefined || target.headRef === currentBranch;
  useEffect(() => {
    if (target.compare !== 'commits' || !history.data || !target.commits?.length) return;
    const available = new Set(history.data.commits.map((commit) => commit.sha));
    const commits = target.commits.filter((sha) => available.has(sha));
    if (commits.length !== target.commits.length) onTargetChange({ ...target, commits });
  }, [history.data, target, onTargetChange]);
  function change(values: Partial<LocalTarget>) {
    onTargetChange({ ...target, ...values });
  }
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
        {diff.data && target.compare !== 'commits' && (
          <span>
            {describeBase(
              target.compare,
              diff.data.base,
              t,
              workingHead && target.includeUncommitted !== false,
            )}
          </span>
        )}
        <fieldset className={styles.compare}>
          <legend className={styles.hidden}>{t('Changes to show')}</legend>
          {COMPARES.map((option) => (
            <label key={option.id} className={styles.option}>
              <input
                type="radio"
                name={groupName}
                checked={target.compare === option.id}
                onChange={() =>
                  onTargetChange({ repositoryId: target.repositoryId, compare: option.id })
                }
              />
              {t(option.label)}
            </label>
          ))}
        </fieldset>
      </div>
      {target.compare !== 'uncommitted' && history.isPending && (
        <p role="status">{t('Loading local history…')}</p>
      )}
      {target.compare !== 'uncommitted' && history.isError && (
        <StatusMessage
          title={t('Could not load local history')}
          tone="error"
          onRetry={() => void history.refetch()}
        >
          {history.error.message}
        </StatusMessage>
      )}
      {target.compare === 'branch' && (
        <div className={styles.selectors}>
          <label>
            {t('Base branch')}
            <select
              aria-label={t('Base branch')}
              value={target.baseRef ?? ''}
              disabled={!history.data}
              onChange={(event) =>
                change({
                  baseRef: event.target.value || undefined,
                  includeUncommitted: workingHead && (target.includeUncommitted ?? true),
                })
              }
            >
              <option value="">{t('Automatic base')}</option>
              {branches.map((branch) => (
                <option key={branch.name} value={branch.name}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Compare branch')}
            <select
              aria-label={t('Compare branch')}
              value={target.headRef ?? ''}
              disabled={!history.data}
              onChange={(event) =>
                change({
                  headRef: event.target.value || undefined,
                  includeUncommitted:
                    event.target.value && event.target.value !== currentBranch
                      ? false
                      : (target.includeUncommitted ?? true),
                })
              }
            >
              <option value="">{t('Current checkout')}</option>
              {branches.map((branch) => (
                <option key={branch.name} value={branch.name}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          {workingHead && (
            <label className={styles.option}>
              <input
                type="checkbox"
                checked={target.includeUncommitted ?? true}
                onChange={(event) => change({ includeUncommitted: event.target.checked })}
              />
              {t('Include uncommitted changes')}
            </label>
          )}
        </div>
      )}
      {target.compare === 'commits' && (
        <>
          <div className={styles.selectors}>
            <label>
              {t('Commit history branch')}
              <select
                aria-label={t('Commit history branch')}
                value={target.headRef ?? ''}
                disabled={!history.data}
                onChange={(event) =>
                  change({ headRef: event.target.value || undefined, commits: [] })
                }
              >
                <option value="">{t('Current checkout')}</option>
                {branches.map((branch) => (
                  <option key={branch.name} value={branch.name}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className={styles.history}>
            <legend>{t('Select commits')}</legend>
            {history.isSuccess && history.data.commits.length === 0 && (
              <p>{t('No commits on this branch.')}</p>
            )}
            {(history.data?.commits ?? []).map((commit) => (
              <label key={commit.sha} className={styles.commit}>
                <input
                  type="checkbox"
                  checked={target.commits?.includes(commit.sha) ?? false}
                  onChange={(event) =>
                    change({
                      commits: event.target.checked
                        ? [...(target.commits ?? []), commit.sha]
                        : target.commits?.filter((sha) => sha !== commit.sha),
                    })
                  }
                />
                <span>
                  <strong>{commit.subject}</strong> <code>{commit.sha.slice(0, 7)}</code>
                  <small>
                    {commit.author} · {commit.date}
                  </small>
                </span>
              </label>
            ))}
          </fieldset>
          {history.data?.hasMore && <p>{t('Showing the latest 100 commits.')}</p>}
        </>
      )}
    </header>
  );
}
export function describeBase(
  compare: LocalCompare,
  base: LocalDiff['base'],
  t = createTranslator('en'),
  includeUncommitted = true,
): string {
  if (!base) return t('No commits yet, so every file is new.');
  if (compare === 'branch' && base.name !== 'HEAD') {
    return t(
      includeUncommitted
        ? 'Compared with {name} at {commit}, including uncommitted work.'
        : 'Compared with {name} at {commit}.',
      { name: base.name, commit: base.commit.slice(0, 7) },
    );
  }
  return t('Compared with the last commit, {commit}.', { commit: base.commit.slice(0, 7) });
}
