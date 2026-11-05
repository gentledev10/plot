import { AI_PROVIDERS, type AiProviderId } from '@shared/ai';
import type { PullRequestRef } from '@shared/github';
import { pullRequestKey } from '@shared/pull-request-ref';
import type {
  Architecture,
  CodeLocation,
  Flow,
  ReviewDiagramKind,
  ReviewMap,
  ReviewStatus,
} from '@shared/review';
import { NODE_TEST_PATH } from '@shared/review-execution';
import {
  defaultReviewPlan,
  type ReviewStep,
  reviewContentKey,
  stepTitle,
} from '@shared/review-plan';
import type { ReviewUnit } from '@shared/review-unit';
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  Maximize2,
  Minimize2,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { IconButton } from '../../components/IconButton';
import { StatusMessage } from '../../components/StatusMessage';
import { InlineText, StructuredText } from '../../components/StructuredText';
import { formatAge } from '../../lib/format';
import { useAiSettings } from '../ai/queries';
import { useAppearance } from '../appearance/AppearanceProvider';
import { usePullRequestDiff } from '../diff/queries';
import { useCommand, useShortcutLabel, withShortcut } from '../keymap/KeymapProvider';
import { useLanguage, useT } from '../language/LanguageProvider';
import { architectureOverview } from './architecture-overview';
import { BehaviorSimulation } from './BehaviorSimulation';
import { FlowchartLegend } from './FlowchartLegend';
import { MermaidDiagram } from './MermaidDiagram';
import {
  architectureToMermaid,
  compareFlow,
  nodeIndexFromElementId,
  sequenceToMermaid,
} from './mermaid-source';
import { useReviewActions, useReviewStatus } from './queries';
import { ReviewActivities } from './ReviewActivities';
import { type ExecutionContext, ReviewExecution } from './ReviewExecution';
import styles from './ReviewPanel.module.css';
import { useReviewPlan } from './ReviewPlanProvider';
import { useReviewReading } from './ReviewReadingProvider';
import { ReviewScope } from './ReviewScope';
import { VisualWalkthrough } from './VisualWalkthrough';

interface ReviewPanelProps {
  target?: PullRequestRef;
  onOpenLocation(location: CodeLocation): void;
  onConfigureAi?(): void;
  onConfigurePlan?(): void;
  maximized?: boolean;
  onToggleMaximize?(): void;
  notice?: string;
}
interface Maximizing {
  maximized?: boolean;
  onToggleMaximize?(): void;
}
export function ReviewPanel({
  target,
  onOpenLocation,
  onConfigureAi,
  onConfigurePlan,
  maximized = false,
  onToggleMaximize,
  notice = 'Open a pull request to get an overview of its changes.',
}: ReviewPanelProps) {
  const t = useT();
  const maximizing = {
    maximized,
    onToggleMaximize,
  };
  return (
    <aside className={styles.panel} aria-label={t('AI overview')} data-maximized={maximized}>
      {target ? (
        <PullRequestReview
          target={target}
          onOpenLocation={onOpenLocation}
          onConfigureAi={onConfigureAi}
          onConfigurePlan={onConfigurePlan}
          {...maximizing}
        />
      ) : (
        <>
          <PanelHeader onConfigurePlan={onConfigurePlan} {...maximizing} />
          <StatusMessage>{notice}</StatusMessage>
        </>
      )}
    </aside>
  );
}
function PanelHeader({
  onRegenerate,
  onConfigurePlan,
  maximized,
  onToggleMaximize,
}: Maximizing & {
  onRegenerate?(): void;
  onConfigurePlan?(): void;
}) {
  const t = useT();
  const shortcut = useShortcutLabel('view.maximizeReview');
  return (
    <header className={styles.header}>
      <h2 className={styles.title}>{t('AI overview')}</h2>
      <span className={styles.headerActions}>
        {onConfigurePlan && (
          <IconButton label={t('Review format')} onClick={onConfigurePlan}>
            <SlidersHorizontal size={14} />
          </IconButton>
        )}
        {onRegenerate && (
          <IconButton label={t('Generate again')} onClick={onRegenerate}>
            <RotateCw size={14} />
          </IconButton>
        )}
        {onToggleMaximize && (
          <IconButton
            label={withShortcut(maximized ? t('Restore') : t('Maximize'), shortcut)}
            onClick={onToggleMaximize}
          >
            {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </IconButton>
        )}
      </span>
    </header>
  );
}
interface PullRequestReviewProps extends Maximizing {
  target: PullRequestRef;
  onOpenLocation(location: CodeLocation): void;
  onConfigureAi?(): void;
  onConfigurePlan?(): void;
}
function PullRequestReview({
  target,
  onOpenLocation,
  onConfigureAi,
  onConfigurePlan,
  ...maximizing
}: PullRequestReviewProps) {
  const t = useT();
  const { language } = useLanguage();
  const { plan } = useReviewPlan();
  const reading = useReviewReading();
  const status = useReviewStatus(target);
  const ai = useAiSettings();
  const { start, cancel } = useReviewActions(target);
  const diff = usePullRequestDiff(target);
  const changedPaths = useMemo(
    () => new Set(diff.data?.files.map((file) => file.path) ?? []),
    [diff.data],
  );
  const generate = () => {
    if (plan.steps.length > 0) start.mutate();
  };
  const done = status.data?.state === 'done' ? status.data : undefined;
  useCommand(
    'review.generate',
    generate,
    status.data !== undefined &&
      status.data.state !== 'running' &&
      !start.isPending &&
      plan.steps.length > 0,
  );
  return (
    <>
      <PanelHeader
        onConfigurePlan={onConfigurePlan}
        onRegenerate={done && !start.isPending && plan.steps.length > 0 ? generate : undefined}
        {...maximizing}
      />
      <div className={styles.content}>
        {start.isError && (
          <StatusMessage tone="error" onRetry={generate}>
            {start.error.message}
          </StatusMessage>
        )}
        {renderBody()}
        {diff.data && (done || reading.question?.target === pullRequestKey(target)) && (
          <ReviewActivities
            target={target}
            head={diff.data.head}
            units={done?.review.units ?? []}
            onOpenLocation={onOpenLocation}
          />
        )}
        {diff.data &&
          done &&
          (() => {
            const focus =
              reading.focus?.target === pullRequestKey(target) &&
              reading.focus.head === diff.data.head &&
              reading.focus.mode === 'unit'
                ? reading.focus
                : undefined;
            const unit = done.review.units?.find((u) => u.id === focus?.unitId);
            const paths = diff.data.files
              .filter(
                (f) =>
                  f.kind === 'file' &&
                  f.newBlob &&
                  NODE_TEST_PATH.test(f.path) &&
                  (!unit || unit.files.some((p) => p.path === f.path)),
              )
              .map((f) => f.path)
              .slice(0, 8);
            return (
              paths.length > 0 && (
                <ReviewExecution
                  context={{ ref: target, head: diff.data.head, unitId: unit?.id }}
                  paths={paths}
                />
              )
            );
          })()}
      </div>
    </>
  );
  function renderBody() {
    if (status.isPending) {
      return <StatusMessage>{t('Checking for a saved overview…')}</StatusMessage>;
    }
    if (status.isError) {
      return (
        <StatusMessage
          tone="error"
          title={t('Could not load the overview')}
          onRetry={() => void status.refetch()}
        >
          {status.error.message}
        </StatusMessage>
      );
    }
    const current: ReviewStatus = status.data;
    if (plan.steps.length === 0 && current.state !== 'running')
      return (
        <StatusMessage
          action={onConfigurePlan ? { label: 'Review format', run: onConfigurePlan } : undefined}
        >
          {t('No review steps yet. Add a step or restore the defaults in Review format.')}
        </StatusMessage>
      );
    switch (current.state) {
      case 'idle':
        return (
          <Introduction
            provider={ai.data?.provider}
            onGenerate={generate}
            onConfigure={onConfigureAi}
            busy={start.isPending}
          />
        );
      case 'running':
        return (
          <Progress
            startedAt={current.startedAt}
            activity={current.activity}
            onCancel={() => cancel.mutate()}
          />
        );
      case 'failed':
        return (
          <StatusMessage tone="error" title={t('Could not make the overview')} onRetry={generate}>
            <p>{t(current.error.message)}</p>
            {onConfigureAi && (
              <button type="button" className={styles.link} onClick={onConfigureAi}>
                {t('Open AI settings')}
              </button>
            )}
          </StatusMessage>
        );
      case 'done':
        return (
          <>
            {(current.planKey ?? reviewContentKey(defaultReviewPlan())) !==
              reviewContentKey(plan) && (
              <div className={styles.stale} role="status">
                <p>
                  {t(
                    'Your review instructions changed. Generate again to apply them. The previous analysis is shown below.',
                  )}
                </p>
                <button
                  type="button"
                  className={styles.link}
                  disabled={start.isPending}
                  onClick={generate}
                >
                  {t('Generate again')}
                </button>
              </div>
            )}
            {!!current.review.units?.length &&
              diff.data?.head === current.head &&
              plan.steps.some((step) => step.kind === 'changes' && step.visible) && (
                <ReviewScope target={target} head={current.head} units={current.review.units} />
              )}
            {diff.data?.head === current.head &&
            reading.focus?.target === pullRequestKey(target) &&
            reading.focus.head === current.head &&
            reading.focus.mode === 'unit' &&
            plan.steps.some((step) => step.kind === 'changes' && step.visible) &&
            current.review.units?.some((unit) => unit.id === reading.focus?.unitId) ? (
              <UnitReview
                execution={{ ref: target, head: current.head, unitId: reading.focus.unitId }}
                unit={
                  current.review.units.find(
                    (unit) => unit.id === reading.focus?.unitId,
                  ) as ReviewUnit
                }
                review={current.review}
                changedPaths={changedPaths}
                onOpenLocation={onOpenLocation}
                onExpandMap={!maximizing.maximized ? maximizing.onToggleMaximize : undefined}
              />
            ) : (
              <ReviewMapView
                execution={{ ref: target, head: current.head }}
                review={current.review}
                changedPaths={changedPaths}
                onOpenLocation={onOpenLocation}
                onExpandMap={!maximizing.maximized ? maximizing.onToggleMaximize : undefined}
              />
            )}
            <p className={styles.footnote}>
              {t('Generated')}
              {current.provider &&
                t(' by {value0}', {
                  value0: AI_PROVIDERS[current.provider].name,
                })}
              {current.model && ` (${current.model})`}{' '}
              {formatAge(current.createdAt, undefined, language)}
              {current.costUsd !== undefined && (
                <span>
                  {t(', cost $')}
                  {current.costUsd.toFixed(2)}
                </span>
              )}
              <span className={styles.analysisNote}>
                {t('Based on code analysis. Tests were not run.')}
              </span>
            </p>
          </>
        );
    }
  }
}
interface IntroductionProps {
  provider?: AiProviderId;
  onGenerate(): void;
  onConfigure?(): void;
  busy: boolean;
}
function Introduction({ provider, onGenerate, onConfigure, busy }: IntroductionProps) {
  const t = useT();
  const name = provider ? AI_PROVIDERS[provider].name : 'Your AI tool';
  return (
    <div className={styles.intro}>
      <p>
        {t(
          'Understand this change before reading the diff: what it changes, how the flow differs from before, and the architecture around it. Every item links to the code.',
        )}
      </p>
      <button type="button" className={styles.primary} onClick={onGenerate} disabled={busy}>
        <Sparkles size={14} />
        {t(' Review changes')}
      </button>
      <p className={styles.muted}>
        {name}
        {t(
          ' reads this pull request, related code and selected repository documentation and settings on this Mac, with read-only access. It takes a minute or two and counts toward your ',
        )}
        {name}
        {t(' usage.')}
        {onConfigure && (
          <>
            {' '}
            <button type="button" className={styles.link} onClick={onConfigure}>
              {t('Choose another AI tool')}
            </button>
          </>
        )}
      </p>
    </div>
  );
}
function Progress({
  startedAt,
  activity,
  onCancel,
}: {
  startedAt: string;
  activity: string[];
  onCancel(): void;
}) {
  const t = useT();
  const elapsed = useElapsed(startedAt);
  return (
    <div className={styles.progress} role="status">
      <div className={styles.progressHeader}>
        <LoaderCircle size={14} className={styles.spinner} />
        <span>
          {t('Reading the change… ')}
          {elapsed}
        </span>
        <button type="button" className={styles.secondary} onClick={onCancel}>
          {t('Cancel')}
        </button>
      </div>
      <ol className={styles.activity}>
        {activity.slice(-8).map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: activity entries repeat and only ever append
          <li key={`${index}-${item}`}>{t(item)}</li>
        ))}
      </ol>
    </div>
  );
}
function useElapsed(startedAt: string): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function UnitReview({
  execution,
  unit,
  review,
  changedPaths,
  onOpenLocation,
  onExpandMap,
}: {
  execution?: ExecutionContext;
  unit: ReviewUnit;
  review: ReviewMap;
  changedPaths: ReadonlySet<string>;
  onOpenLocation(location: CodeLocation): void;
  onExpandMap?(): void;
}) {
  const t = useT();
  const { plan } = useReviewPlan();
  const simulations = review.simulations?.filter(
    (simulation) =>
      unit.simulationIds.includes(simulation.id) ||
      unit.changeTitles.includes(simulation.changeTitle),
  );
  const changes = new Set([
    ...unit.changeTitles,
    ...(simulations?.map((simulation) => simulation.changeTitle) ?? []),
  ]);
  const scoped: ReviewMap = {
    ...review,
    summary: '',
    changes: review.changes.filter((change) => changes.has(change.title)),
    visuals: review.visuals?.filter((visual) => unit.visualTitles.includes(visual.title)),
    simulations,
    architecture: { nodes: [], edges: [] },
    flows: [],
    impacts: [],
    readingOrder: [],
    reviewPoints: review.reviewPoints?.filter((point) =>
      unit.reviewPointTitles.includes(point.title),
    ),
  };
  const tests = unit.files.filter((file) => file.role === 'test');
  return (
    <>
      <section className={styles.unitIntro} aria-label={unit.title}>
        {review.summary && plan.steps.some((step) => step.kind === 'summary' && step.visible) && (
          <StructuredText className={styles.unitOverview} text={review.summary} />
        )}
        <h3>
          <InlineText text={unit.title} />
        </h3>
        <StructuredText text={unit.summary} />
        {unit.rationale && (
          <div className={styles.rationale}>
            <h4>{t('Why this change')}</h4>
            <StructuredText text={unit.rationale} />
            <span className={styles.evidence}>
              {t(
                unit.rationaleEvidence === 'code'
                  ? 'Code reference'
                  : unit.rationaleEvidence === 'description'
                    ? 'PR description'
                    : 'Inference — check this',
              )}
            </span>
          </div>
        )}
        <h4>{t('Related implementation and tests')}</h4>
        <ul className={styles.list}>
          {unit.files.map((file) => (
            <li key={file.path}>
              <span className={styles.evidence}>
                {t(
                  file.role === 'test'
                    ? 'Test'
                    : file.role === 'implementation'
                      ? 'Implementation'
                      : file.role === 'configuration'
                        ? 'Configuration'
                        : file.role === 'documentation'
                          ? 'Documentation'
                          : 'File',
                )}
              </span>
              <LocationLink
                location={{ path: file.path, line: file.ranges[0]?.startLine ?? 1 }}
                changedPaths={changedPaths}
                onOpen={onOpenLocation}
              />
              <StructuredText className={styles.reason} text={file.reason} />
            </li>
          ))}
        </ul>
        <p className={styles.muted}>
          {t(
            tests.length
              ? 'These test files are reading links, not test results.'
              : 'No changed tests are linked to this unit. Existing tests may still cover it.',
          )}
        </p>
      </section>
      <ReviewMapView
        execution={execution}
        review={scoped}
        changedPaths={changedPaths}
        onOpenLocation={onOpenLocation}
        onExpandMap={onExpandMap}
        includeKinds={new Set(['changes', 'architecture', 'reviewPoints'])}
      />
      {plan.steps.some((step) => step.kind === 'custom' && step.visible) && (
        <details className={styles.unitIntro}>
          <summary>{t('Custom steps for the whole PR')}</summary>
          <ReviewMapView
            review={review}
            changedPaths={changedPaths}
            onOpenLocation={onOpenLocation}
            onExpandMap={onExpandMap}
            includeKinds={new Set(['custom'])}
          />
        </details>
      )}
    </>
  );
}

interface ReviewMapViewProps {
  execution?: ExecutionContext;
  review: ReviewMap;
  changedPaths: ReadonlySet<string>;
  onOpenLocation(location: CodeLocation): void;
  onExpandMap?(): void;
  includeKinds?: ReadonlySet<ReviewStep['kind']>;
}
export function ReviewMapView({
  execution,
  review,
  changedPaths,
  onOpenLocation,
  onExpandMap,
  includeKinds,
}: ReviewMapViewProps) {
  const t = useT();
  const { plan } = useReviewPlan();
  const link = (location: CodeLocation | undefined) =>
    location && (
      <LocationLink location={location} changedPaths={changedPaths} onOpen={onOpenLocation} />
    );
  const graph = (architecture: Architecture, kind?: ReviewDiagramKind, overview = false) => (
    <ArchitectureView
      architecture={architecture}
      kind={kind}
      changedPaths={changedPaths}
      onOpenLocation={onOpenLocation}
      onExpandMap={onExpandMap}
      overview={overview}
      link={link}
    />
  );
  const content = (step: ReviewStep): ReactNode => {
    switch (step.kind) {
      case 'summary':
        return <StructuredText text={review.summary || t('Generate again to fill this step.')} />;
      case 'changes':
        return review.changes.length > 0 ? (
          <ProgressiveList
            className={styles.changes}
            limit={step.detail === 'detailed' ? 15 : step.detail === 'brief' ? 1 : 3}
          >
            {review.changes.map((change, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stored analysis order is fixed
              <li key={`${index}-${change.title}`} className={styles.change}>
                <h4 className={styles.itemTitle}>
                  <InlineText text={change.title} />
                </h4>
                {change.location && (
                  <div className={styles.references}>{link(change.location)}</div>
                )}
                <dl className={styles.beforeAfter}>
                  {change.before && (
                    <>
                      <dt>{t('Before')}</dt>
                      <dd>
                        <StructuredText text={change.before} />
                      </dd>
                    </>
                  )}
                  {change.after && (
                    <>
                      <dt>{t('Now')}</dt>
                      <dd>
                        <StructuredText text={change.after} />
                      </dd>
                    </>
                  )}
                </dl>
                {review.simulations
                  ?.filter((simulation) => simulation.changeTitle === change.title)
                  .map((simulation) => (
                    <BehaviorSimulation
                      execution={execution}
                      key={simulation.id}
                      simulation={simulation}
                      changedPaths={changedPaths}
                      onOpenLocation={onOpenLocation}
                      link={link}
                      onExpand={onExpandMap}
                    />
                  ))}
              </li>
            ))}
          </ProgressiveList>
        ) : null;
      case 'flows':
        return review.flows.length > 0
          ? review.flows.map((flow, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stored analysis order is fixed
              <FlowView key={`${index}-${flow.title}`} flow={flow} link={link} />
            ))
          : null;
      case 'architecture':
        if (review.visuals?.length)
          return (
            <VisualWalkthrough
              visuals={review.visuals}
              changedPaths={changedPaths}
              onOpenLocation={onOpenLocation}
              link={link}
              onExpand={onExpandMap}
            />
          );
        return review.architecture.nodes.length > 0
          ? graph(review.architecture, undefined, true)
          : null;
      case 'reviewPoints':
        return review.reviewPoints === undefined ? (
          <p className={styles.muted}>{t('Generate again to fill this step.')}</p>
        ) : review.reviewPoints.length === 0 ? (
          <p className={styles.muted}>
            {t(
              'No specific review checks were identified. Use the code walkthrough to inspect the change.',
            )}
          </p>
        ) : (
          <ProgressiveList className={styles.concerns} limit={step.detail === 'detailed' ? 8 : 3}>
            {review.reviewPoints.map((point, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stored analysis order is fixed
              <li key={`${index}-${point.title}`}>
                <h4 className={styles.itemTitle}>
                  <InlineText text={point.title} />
                </h4>
                <div className={styles.references}>
                  <span className={styles.evidence}>
                    {t(
                      point.evidence === 'code'
                        ? 'Code reference'
                        : point.evidence === 'description'
                          ? 'PR description'
                          : 'Inference — check this',
                    )}
                  </span>
                  {link(point.location)}
                </div>
                <StructuredText text={point.reason} className={styles.reason} />
                <div className={styles.check}>
                  <strong>{t('Check: {what}', { what: '' })}</strong>
                  <StructuredText text={point.check} />
                </div>
              </li>
            ))}
          </ProgressiveList>
        );
      case 'impacts':
        return review.impacts.length > 0 ? (
          <ul className={styles.list}>
            {review.impacts.map((impact, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stored analysis order is fixed
              <li key={`${index}-${impact.area}`}>
                <h4 className={styles.itemTitle}>
                  <InlineText text={impact.area} />
                </h4>
                {link(impact.location)}
                <StructuredText className={styles.reason} text={impact.detail} />
              </li>
            ))}
          </ul>
        ) : null;
      case 'readingOrder':
        return review.readingOrder.length > 0 ? (
          <ProgressiveList ordered limit={5}>
            {review.readingOrder.map((item) => (
              <li key={item.path}>
                {link({ path: item.path, line: 1, verified: true })}
                <StructuredText className={styles.reason} text={item.reason} />
              </li>
            ))}
          </ProgressiveList>
        ) : null;
      case 'custom': {
        const section = review.customSections?.find((item) => item.id === step.id);
        if (!section)
          return (
            <p className={styles.muted}>
              {t(
                !step.title.trim() && !step.instructions.trim()
                  ? 'Add a title or instructions to tell the AI what this step should cover.'
                  : 'Generate again to fill this step.',
              )}
            </p>
          );
        return (
          <>
            {section.body && <StructuredText text={section.body} />}
            {section.items.length > 0 && (
              <ul className={styles.list}>
                {section.items.map((item, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: stored analysis order is fixed
                  <li key={`${index}-${item.area}`}>
                    <h4 className={styles.itemTitle}>
                      <InlineText text={item.area} />
                    </h4>
                    {link(item.location)}
                    <StructuredText className={styles.reason} text={item.detail} />
                  </li>
                ))}
              </ul>
            )}
            {section.diagram &&
              section.diagram.nodes.length > 0 &&
              graph(section.diagram, section.diagram.kind)}
          </>
        );
      }
    }
  };
  const cards = plan.steps
    .filter((step) => step.visible && (!includeKinds || includeKinds.has(step.kind)))
    .map((step) => ({ step, body: content(step) }))
    .filter(({ body }) => body !== null);
  return (
    <div className={styles.review}>
      {cards.length === 0 && (
        <p className={styles.muted}>
          {t(
            plan.steps.some((step) => step.visible)
              ? 'No relevant content was found for these steps.'
              : 'All review cards are hidden. Enable Show in results in Review format to see them.',
          )}
        </p>
      )}
      {cards.map(({ step, body }, index) => (
        <ReviewCard
          key={step.id}
          id={step.id}
          title={step.title.trim() || t(stepTitle(step))}
          number={index + 1}
        >
          {body}
        </ReviewCard>
      ))}
    </div>
  );
}

function ProgressiveList({
  children,
  limit,
  ordered = false,
  className = styles.list,
}: {
  children: ReactNode[];
  limit: number;
  ordered?: boolean;
  className?: string;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const List = ordered ? 'ol' : 'ul';
  return (
    <>
      <List className={className}>{expanded ? children : children.slice(0, limit)}</List>
      {children.length > limit && (
        <button
          type="button"
          className={styles.link}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {t(expanded ? 'Show less' : 'Show {count} more', { count: children.length - limit })}
        </button>
      )}
    </>
  );
}

function ReviewCard({
  id,
  title,
  number,
  children,
}: {
  id: string;
  title: string;
  number: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <article className={styles.card} data-step-id={id} aria-labelledby={`review-title-${id}`}>
      <h3 id={`review-title-${id}`}>
        <button
          type="button"
          className={styles.cardToggle}
          aria-expanded={open}
          aria-controls={`review-body-${id}`}
          onClick={() => setOpen(!open)}
        >
          <span className={styles.cardNumber} aria-hidden="true">
            {number}
          </span>
          <span>{title}</span>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </h3>
      <div id={`review-body-${id}`} className={styles.cardBody} hidden={!open}>
        {children}
      </div>
    </article>
  );
}

function ArchitectureView({
  architecture,
  kind = 'components',
  changedPaths,
  onOpenLocation,
  link,
  onExpandMap,
  overview = false,
}: {
  architecture: Architecture;
  kind?: ReviewDiagramKind;
  changedPaths: ReadonlySet<string>;
  onOpenLocation(location: CodeLocation): void;
  link(location: CodeLocation | undefined): ReactNode;
  onExpandMap?(): void;
  overview?: boolean;
}) {
  const t = useT();
  const scheme = useAppearance().theme.kind;
  const [detail, setDetail] = useState(false);
  const areas = useMemo(
    () => (overview ? architectureOverview(architecture) : undefined),
    [architecture, overview],
  );
  const showingAreas = !!areas && !detail;
  const displayed = showingAreas ? areas : architecture;
  const diagramKind = kind === 'sequence' && architecture.edges.length === 0 ? 'components' : kind;
  const source = useMemo(() => {
    if (diagramKind !== 'sequence')
      return architectureToMermaid(
        displayed,
        scheme,
        showingAreas || diagramKind === 'flowchart' ? 'TD' : 'LR',
        !showingAreas && diagramKind === 'flowchart',
      ).source;
    const names = new Map(architecture.nodes.map((node) => [node.id, node.label]));
    return sequenceToMermaid(
      architecture.edges.map((edge) => ({
        from: names.get(edge.from) ?? edge.from,
        to: names.get(edge.to) ?? edge.to,
        label: edge.label ?? '',
      })),
    );
  }, [architecture, displayed, scheme, diagramKind, showingAreas]);
  return (
    <>
      {architecture.summary && (
        <StructuredText className={styles.mapSummary} text={architecture.summary} />
      )}
      {diagramKind === 'flowchart' && <FlowchartLegend />}
      {areas && (
        <fieldset className={styles.mapViews} aria-label={t('Map detail')}>
          <button type="button" aria-pressed={!detail} onClick={() => setDetail(false)}>
            {t('System overview')}
          </button>
          <button type="button" aria-pressed={detail} onClick={() => setDetail(true)}>
            {t('Components ({count})', { count: architecture.nodes.length })}
          </button>
        </fieldset>
      )}
      {showingAreas && (
        <p className={styles.muted}>
          {t('Areas are summarized here. Open Components for exact changes and code links.')}
        </p>
      )}
      {diagramKind !== 'sequence' && (
        <div className={styles.mapToolbar}>
          <span>{t('Highlighted: this PR · Dashed: inferred')}</span>
          {onExpandMap && (
            <button type="button" className={styles.link} onClick={onExpandMap}>
              {t('Enlarge map')}
            </button>
          )}
        </div>
      )}
      <MermaidDiagram
        fit
        source={source}
        label={t(
          diagramKind === 'sequence'
            ? 'Sequence diagram'
            : diagramKind === 'flowchart'
              ? 'Flow diagram'
              : 'Components around this change',
        )}
        onElementClick={(elementId) => {
          if (diagramKind === 'sequence') return;
          const index = nodeIndexFromElementId(elementId);
          const location = index === undefined ? undefined : displayed.nodes[index]?.location;
          if (location && changedPaths.has(location.path)) onOpenLocation(location);
        }}
      />
      <details className={styles.mapDetails}>
        <summary>{t('Components and analysis scope')}</summary>
        {architecture.scope && (
          <StructuredText className={styles.muted} text={architecture.scope} />
        )}
        {architecture.grouping === 'source-files' && (
          <p className={styles.muted}>
            {t(
              'Areas are grouped by source file; additional architectural boundaries were not inferred.',
            )}
          </p>
        )}
        {!architecture.scope && (
          <p className={styles.muted}>
            {t(
              'This saved map covers the inspected context. Generate again for a grouped change map.',
            )}
          </p>
        )}
        <ul className={styles.list}>
          {architecture.nodes.map((node) => (
            <li key={node.id}>
              <span>{node.label}</span>
              {node.evidence && (
                <span className={styles.evidence}>
                  {t(
                    node.evidence === 'code'
                      ? 'Code reference'
                      : node.evidence === 'docs'
                        ? 'Repository documentation'
                        : 'Inference — check this',
                  )}
                </span>
              )}
              {node.status !== 'unchanged' && (
                <span className={styles.status} data-status={node.status}>
                  {t(node.status)}
                </span>
              )}
              {link(node.location)}
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
interface FlowViewProps {
  flow: Flow;
  link(location: CodeLocation | undefined): ReactNode;
}
function FlowView({ flow, link }: FlowViewProps) {
  const t = useT();
  const comparison = useMemo(() => compareFlow(flow), [flow]);
  const both = flow.before.length > 0 && flow.after.length > 0;
  return (
    <section
      aria-label={t('Flow: {value0}', {
        value0: flow.title,
      })}
    >
      <h3>{flow.title}</h3>
      {!both && (
        <p className={styles.muted}>
          {flow.before.length === 0
            ? t('A new flow added by this change.')
            : t('A flow this change removes.')}
        </p>
      )}
      <div className={styles.flowPair}>
        {flow.before.length > 0 && (
          <div>
            {both && <h4 className={styles.side}>{t('Before')}</h4>}
            <MermaidDiagram
              source={sequenceToMermaid(flow.before, comparison.removed, 'removed')}
              label={t('How {value0} worked before', {
                value0: flow.title,
              })}
            />
          </div>
        )}
        {flow.after.length > 0 && (
          <div>
            {both && <h4 className={styles.side}>{t('Now')}</h4>}
            <MermaidDiagram
              source={sequenceToMermaid(flow.after, comparison.added, 'added')}
              label={t('How {value0} works now', {
                value0: flow.title,
              })}
            />
          </div>
        )}
      </div>
      {both && (comparison.added.size > 0 || comparison.removed.size > 0) && (
        <p className={styles.legend}>
          <span className={styles.swatch} data-highlight="removed" />
          {t(' Removed')} <span className={styles.swatch} data-highlight="added" />
          {t(' Added')}
        </p>
      )}
      {flow.after.length > 0 && (
        <ol className={styles.list}>
          {flow.after.map((step, stepIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a stored overview never changes order, and labels can repeat
            <li key={`${stepIndex}-${step.label}`}>
              <span>
                {step.from} → {step.to}: {step.label}
              </span>
              {link(step.location)}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
interface LocationLinkProps {
  location: CodeLocation;
  changedPaths: ReadonlySet<string>;
  onOpen(location: CodeLocation): void;
}
function LocationLink({ location, changedPaths, onOpen }: LocationLinkProps) {
  const t = useT();
  const text = location.line > 1 ? `${location.path}:${location.line}` : location.path;
  const unverified = location.verified === false && (
    <span
      className={styles.unverified}
      title={t('The AI pointed at a line that does not exist in this pull request.')}
    >
      <CircleAlert size={12} />
      {t(' unverified')}
    </span>
  );
  if (!changedPaths.has(location.path)) {
    return (
      <span className={styles.location} title={t('This file is not changed in this pull request.')}>
        {text}
        {unverified}
      </span>
    );
  }
  return (
    <span className={styles.location}>
      <button type="button" className={styles.locationButton} onClick={() => onOpen(location)}>
        {text}
      </button>
      {unverified}
    </span>
  );
}
