import { AI_PROVIDERS } from '@shared/ai';
import type { ChangedFile } from '@shared/diff';
import type { LocalTarget } from '@shared/local';
import type { CodeLocation } from '@shared/review';
import { reviewContentKey } from '@shared/review-plan';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../app/providers';
import { StatusMessage } from '../../components/StatusMessage';
import { useAiSettings } from '../ai/queries';
import { useLanguage, useT } from '../language/LanguageProvider';
import { ReviewMapView } from '../review/ReviewPanel';
import styles from '../review/ReviewPanel.module.css';
import { useReviewPlan } from '../review/ReviewPlanProvider';
import localStyles from './LocalReviewPanel.module.css';

export interface LocalReviewPanelProps {
  target: LocalTarget;
  files: readonly ChangedFile[];
  signature?: string;
  onOpenLocation(location: CodeLocation): void;
  onConfigureAi?(): void;
  onConfigurePlan?(): void;
  maximized?: boolean;
  onToggleMaximize?(): void;
}
export function LocalReviewPanel({
  target,
  files,
  signature,
  onOpenLocation,
  onConfigureAi,
  onConfigurePlan,
  maximized,
  onToggleMaximize,
}: LocalReviewPanelProps) {
  const api = useApi();
  const t = useT();
  const client = useQueryClient();
  const { plan, flush } = useReviewPlan();
  const { reviewLanguage } = useLanguage();
  const key = ['local-review', target, signature ?? '', reviewLanguage, reviewContentKey(plan)];
  const status = useQuery({
    queryKey: key,
    queryFn: () => api.getLocalReviewStatus(target),
    enabled: files.length > 0,
    refetchInterval: 1_000,
  });
  const ai = useAiSettings();
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const start = useMutation({
    mutationFn: async () => {
      await flush();
      await api.startLocalReview(target);
    },
    onSettled: refresh,
  });
  const cancel = useMutation({
    mutationFn: () => api.cancelLocalReview(target),
    onSettled: refresh,
  });
  const done = !status.error && status.data?.state === 'done' ? status.data : undefined;
  const running = status.data?.state === 'running' ? status.data : undefined;
  return (
    <aside className={styles.panel} aria-label={t('AI overview')} data-maximized={maximized}>
      <header className={`${styles.header} ${localStyles.header}`}>
        <h2 className={styles.title}>{t('AI overview')}</h2>
        {onConfigurePlan && (
          <button type="button" onClick={onConfigurePlan}>
            {t('Review format')}
          </button>
        )}
        {onToggleMaximize && (
          <button type="button" onClick={onToggleMaximize}>
            {t(maximized ? 'Restore' : 'Maximize')}
          </button>
        )}
      </header>
      <div className={`${styles.content} ${localStyles.content}`}>
        <p>
          {t(
            'The selected local diff and file contents are sent to {provider} when you generate an overview. This uses your provider account and may incur usage charges.',
            {
              provider: ai.data
                ? AI_PROVIDERS[ai.data.provider].name
                : t('your chosen AI provider'),
            },
          )}
        </p>
        <p>
          {t(
            'Only selected file snapshots are shared. Your original repository is not checked out or modified. Tests are not run.',
          )}
        </p>
        {onConfigureAi && (
          <button type="button" className={styles.link} onClick={onConfigureAi}>
            {t('Choose another AI tool')}
          </button>
        )}
        {!files.length && <StatusMessage>{t('No changes')}</StatusMessage>}
        {files.length > 0 && status.isPending && <StatusMessage>{t('Loading…')}</StatusMessage>}
        {(status.error || start.error) && (
          <StatusMessage tone="error">{(status.error ?? start.error)?.message}</StatusMessage>
        )}
        {running && (
          <div role="status" className={styles.progress}>
            <p>{t('Reading local changes…')}</p>
            <ol>
              {running.activity.slice(-8).map((activity, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: repeated activity entries have no stable identifier
                <li key={`${index}-${activity}`}>{activity}</li>
              ))}
            </ol>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
            >
              {t('Cancel')}
            </button>
          </div>
        )}
        {status.data?.state === 'failed' && (
          <StatusMessage tone="error">{status.data.error.message}</StatusMessage>
        )}
        {cancel.error && <StatusMessage tone="error">{cancel.error.message}</StatusMessage>}
        {done && (
          <>
            <ReviewMapView
              review={done.review}
              changedPaths={new Set(files.map((file) => file.path))}
              onOpenLocation={onOpenLocation}
              onExpandMap={onToggleMaximize}
            />
            <p className={styles.footnote}>
              {done.provider && AI_PROVIDERS[done.provider].name}
              {done.model && ` (${done.model})`} ·{' '}
              {t('Based on code analysis. Tests were not run.')}
            </p>
          </>
        )}
        <button
          type="button"
          className={styles.primary}
          disabled={
            start.isPending ||
            status.data?.state === 'running' ||
            !files.length ||
            !plan.steps.length
          }
          onClick={() => start.mutate()}
        >
          {t('Explain local changes')}
        </button>
      </div>
    </aside>
  );
}
