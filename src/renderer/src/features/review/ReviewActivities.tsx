import type { PullRequestRef } from '@shared/github';
import { pullRequestKey } from '@shared/pull-request-ref';
import type { CodeLocation } from '@shared/review';
import type { ReviewTaskScope } from '@shared/review-activity';
import type { ReviewUnit } from '@shared/review-unit';
import { useEffect, useRef, useState } from 'react';
import { InlineText, StructuredText } from '../../components/StructuredText';
import { useT } from '../language/LanguageProvider';
import { useReviewActivity } from './activity-queries';
import styles from './ReviewActivities.module.css';
import { useReviewReading } from './ReviewReadingProvider';

export function ReviewActivities({
  target,
  head,
  units,
  onOpenLocation,
}: {
  target: PullRequestRef;
  head: string;
  units: readonly ReviewUnit[];
  onOpenLocation(location: CodeLocation): void;
}) {
  const t = useT();
  const reading = useReviewReading();
  const activity = useReviewActivity(target);
  const key = pullRequestKey(target);
  const focus =
    reading.focus?.target === key && reading.focus.head === head ? reading.focus : undefined;
  const unitId = focus?.mode === 'unit' ? focus.unitId : undefined;
  const unit = units.find((unit) => unit.id === unitId);
  const context =
    reading.question?.target === key &&
    reading.question.head === head &&
    reading.question.unitId === unitId
      ? reading.question
      : undefined;
  const [question, setQuestion] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (context) field.current?.focus();
  }, [context]);
  const data = activity.query.data;
  const current = !!data && data.head === head;
  const questionJob = data?.questionTask;
  const verifyJob = data?.verificationTask;
  const messages = current ? data.questions.filter((entry) => entry.unitId === unitId) : [];
  const report = current ? data.verifications?.find((entry) => entry.unitId === unitId) : undefined;
  const scope = unit?.title ?? t('Whole PR');
  const questionBusy = questionJob?.state === 'running' || activity.ask.isPending;
  const verifyBusy = verifyJob?.state === 'running' || activity.verify.isPending;
  return (
    <section className={styles.panel} aria-label={t('Questions and AI code review')}>
      <p className={styles.scope}>
        {t('Scope')}: {scope}
      </p>
      <p className={styles.note}>
        {t(
          'Questions and code reviews send new requests to your selected AI tool. A code review may use two separate sessions with the same tool, not different AI models.',
        )}
      </p>
      {activity.query.isError && <p role="alert">{t(activity.query.error.message)}</p>}
      {data && !current && (
        <p role="alert">{t('The PR changed. Refresh the diff before starting this activity.')}</p>
      )}
      <section className={styles.composer} aria-label={t('Ask about this change')}>
        <h3>{t('Ask about this change')}</h3>
        {messages.map((entry) => (
          <article key={entry.id} className={styles.answer}>
            <h4>{entry.question}</h4>
            {entry.selection && (
              <p className={styles.note}>
                {entry.selection.path}:{entry.selection.startLine}–{entry.selection.endLine} ·{' '}
                {t(entry.selection.side === 'original' ? 'Before' : 'After')}
              </p>
            )}
            <StructuredText text={entry.answer} />
            <div className={styles.links}>
              {entry.locations.map((location) => (
                <button
                  type="button"
                  key={`${location.path}:${location.line}`}
                  onClick={() => onOpenLocation(location)}
                >
                  {location.path}:{location.line}
                </button>
              ))}
            </div>
            <SuppliedContext scope={entry} />
          </article>
        ))}
        {context?.selection && (
          <div className={styles.selection}>
            {t('Selected code')}: {context.selection.path}:{context.selection.startLine}–
            {context.selection.endLine} ·{' '}
            {t(context.selection.side === 'original' ? 'Before' : 'After')}
            <button type="button" onClick={() => reading.ask(undefined)}>
              {t('Clear selection')}
            </button>
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!question.trim() || questionBusy || !current) return;
            activity.ask.mutate(
              { head, unitId, question: question.trim(), selection: context?.selection },
              { onSuccess: () => setQuestion('') },
            );
          }}
        >
          <label>
            {t('Your question')}
            <textarea
              ref={field}
              rows={3}
              maxLength={2000}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={t('For example: what happens if this request times out?')}
            />
          </label>
          <button type="submit" disabled={!current || questionBusy || !question.trim()}>
            {t('Ask AI')}
          </button>
          {questionJob?.state === 'running' && (
            <>
              <p role="status">
                {t(questionJob.activity.at(-1) ?? 'Answering the selected code question')}
              </p>
              <button type="button" onClick={() => activity.cancel.mutate('question')}>
                {t('Cancel')}
              </button>
            </>
          )}
        </form>
        {activity.ask.isError && <p role="alert">{t(activity.ask.error.message)}</p>}
        {questionJob?.state === 'failed' && <p role="alert">{t(questionJob.error.message)}</p>}
      </section>
      <div className={styles.verification}>
        <h4>{t('AI code review')}</h4>
        <p className={styles.note}>
          {t(
            'A fresh AI session looks for possible bugs. If it finds any, a second session reviews the code evidence. No code or tests are executed, so these findings are not confirmed bugs.',
          )}
        </p>
        <button
          type="button"
          disabled={!current || verifyBusy}
          onClick={() => activity.verify.mutate({ head, unitId })}
        >
          {t(report ? 'Review code again' : 'Find possible bugs')}
        </button>
        {verifyJob?.state === 'running' && (
          <>
            <p role="status">
              {t(verifyJob.activity.at(-1) ?? 'Independent inspection for concrete defects')}
            </p>
            <button type="button" onClick={() => activity.cancel.mutate('verification')}>
              {t('Cancel')}
            </button>
          </>
        )}
        {activity.verify.isError && <p role="alert">{t(activity.verify.error.message)}</p>}
        {verifyJob?.state === 'failed' && <p role="alert">{t(verifyJob.error.message)}</p>}
        {report && (
          <>
            <StructuredText text={report.summary} />
            {!report.findings.length && (
              <p>
                {t(
                  'No concrete candidate was reported in the supplied context. This is not an approval or a guarantee.',
                )}
              </p>
            )}
            {report.findings.map((finding) => (
              <article key={finding.id} className={styles.finding} data-verdict={finding.verdict}>
                <h4>
                  <InlineText text={finding.title} />
                </h4>
                <p className={styles.note}>
                  {t(
                    finding.severity === 'high'
                      ? 'High priority'
                      : finding.severity === 'medium'
                        ? 'Medium priority'
                        : 'Low priority',
                  )}{' '}
                  ·{' '}
                  {t(
                    finding.verdict === 'supported'
                      ? 'Code evidence found in the second AI review'
                      : finding.verdict === 'dismissed'
                        ? 'Ruled out in the second AI review'
                        : 'Uncertain — inspect the code',
                  )}
                </p>
                <StructuredText text={finding.reason} />
                <div className={styles.check}>
                  <strong>{t('Check: {what}', { what: '' })}</strong>
                  <StructuredText text={finding.check} />
                </div>
                {finding.location && (
                  <button
                    type="button"
                    onClick={() => {
                      if (finding.location) onOpenLocation(finding.location);
                    }}
                  >
                    {finding.location.path}:{finding.location.line}
                  </button>
                )}
                <StructuredText text={t(finding.verificationReason)} />
              </article>
            ))}
            <SuppliedContext scope={report} />
          </>
        )}
      </div>
    </section>
  );
}

function SuppliedContext({ scope }: { scope: ReviewTaskScope }) {
  const t = useT();
  return (
    <details className={styles.context}>
      <summary>{t('Context supplied to AI')}</summary>
      <p>
        {t(
          'Explicit source snapshots: {count}. Other changed files without a full snapshot: {omitted}. This does not measure which files the AI actually read.',
          { count: scope.providedPaths.length, omitted: scope.omittedPaths.length },
        )}
      </p>
      <p>
        {t('Revision')}: <code>{scope.head.slice(0, 12)}</code>
      </p>
      {scope.diffTruncated && (
        <p>{t('The diff context was bounded. Inspect omitted changes separately.')}</p>
      )}
      <ul>
        {scope.providedPaths.map((path) => (
          <li key={path}>{path}</li>
        ))}
      </ul>
      {scope.omittedPaths.length > 0 && (
        <details>
          <summary>{t('Other changed files')}</summary>
          <ul>
            {scope.omittedPaths.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </details>
      )}
    </details>
  );
}
