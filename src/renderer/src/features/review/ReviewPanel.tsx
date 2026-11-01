import { AI_PROVIDERS, type AiProviderId } from '@shared/ai';
import type { PullRequestRef } from '@shared/github';
import type { Architecture, CodeLocation, Flow, ReviewMap, ReviewStatus } from '@shared/review';
import {
  defaultReviewPlan,
  type ReviewStep,
  reviewContentKey,
  stepTitle,
} from '@shared/review-plan';
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
import { formatAge } from '../../lib/format';
import { useAiSettings } from '../ai/queries';
import { useAppearance } from '../appearance/AppearanceProvider';
import { usePullRequestDiff } from '../diff/queries';
import { useCommand, useShortcutLabel, withShortcut } from '../keymap/KeymapProvider';
import { useLanguage, useT } from '../language/LanguageProvider';
import { MermaidDiagram } from './MermaidDiagram';
import {
  architectureToMermaid,
  compareFlow,
  nodeIndexFromElementId,
  sequenceToMermaid,
} from './mermaid-source';
import { useReviewActions, useReviewStatus } from './queries';
import styles from './ReviewPanel.module.css';
import { useReviewPlan } from './ReviewPlanProvider';

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
  const status = useReviewStatus(target);
  const ai = useAiSettings();
  const { start, cancel } = useReviewActions(target);
  const diff = usePullRequestDiff(target);
  const changedPaths = useMemo(
    () => new Set(diff.data?.files.map((file) => file.path) ?? []),
    [diff.data],
  );
  const generate = () => start.mutate();
  const done = status.data?.state === 'done' ? status.data : undefined;
  useCommand(
    'review.generate',
    generate,
    status.data !== undefined && status.data.state !== 'running' && !start.isPending,
  );
  return (
    <>
      <PanelHeader
        onConfigurePlan={onConfigurePlan}
        onRegenerate={done && !start.isPending ? generate : undefined}
        {...maximizing}
      />
      <div className={styles.content}>
        {start.isError && (
          <StatusMessage tone="error" onRetry={generate}>
            {start.error.message}
          </StatusMessage>
        )}
        {renderBody()}
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
            <ReviewMapView
              review={current.review}
              changedPaths={changedPaths}
              onOpenLocation={onOpenLocation}
            />
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
        {t(' Explain this change')}
      </button>
      <p className={styles.muted}>
        {name}
        {t(
          ' reads this pull request and the directories it touches on this Mac, with read-only access. It takes a minute or two and counts toward your ',
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
interface ReviewMapViewProps {
  review: ReviewMap;
  changedPaths: ReadonlySet<string>;
  onOpenLocation(location: CodeLocation): void;
}
function ReviewMapView({ review, changedPaths, onOpenLocation }: ReviewMapViewProps) {
  const t = useT();
  const { plan } = useReviewPlan();
  const link = (location: CodeLocation | undefined) =>
    location && (
      <LocationLink location={location} changedPaths={changedPaths} onOpen={onOpenLocation} />
    );
  const graph = (architecture: Architecture) => (
    <ArchitectureView
      architecture={architecture}
      changedPaths={changedPaths}
      onOpenLocation={onOpenLocation}
      link={link}
    />
  );
  const content = (step: ReviewStep): ReactNode => {
    switch (step.kind) {
      case 'summary':
        return <p className={styles.text}>{review.summary}</p>;
      case 'changes':
        return review.changes.length > 0 ? (
          <ul className={styles.changes}>
            {review.changes.map((change, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stored analysis order is fixed
              <li key={`${index}-${change.title}`} className={styles.change}>
                <strong>{change.title}</strong>
                {link(change.location)}
                <dl className={styles.beforeAfter}>
                  {change.before && (
                    <>
                      <dt>{t('Before')}</dt>
                      <dd>{change.before}</dd>
                    </>
                  )}
                  {change.after && (
                    <>
                      <dt>{t('Now')}</dt>
                      <dd>{change.after}</dd>
                    </>
                  )}
                </dl>
              </li>
            ))}
          </ul>
        ) : null;
      case 'flows':
        return review.flows.length > 0
          ? review.flows.map((flow, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stored analysis order is fixed
              <FlowView key={`${index}-${flow.title}`} flow={flow} link={link} />
            ))
          : null;
      case 'architecture':
        return review.architecture.nodes.length > 0 ? graph(review.architecture) : null;
      case 'impacts':
        return review.impacts.length > 0 ? (
          <ul className={styles.list}>
            {review.impacts.map((impact, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: stored analysis order is fixed
              <li key={`${index}-${impact.area}`}>
                <strong>{impact.area}</strong>
                {link(impact.location)}
                <span className={styles.reason}>{impact.detail}</span>
              </li>
            ))}
          </ul>
        ) : null;
      case 'readingOrder':
        return review.readingOrder.length > 0 ? (
          <ol className={styles.list}>
            {review.readingOrder.map((item) => (
              <li key={item.path}>
                {link({ path: item.path, line: 1, verified: true })}
                <span className={styles.reason}>{item.reason}</span>
              </li>
            ))}
          </ol>
        ) : null;
      case 'custom': {
        const section = review.customSections?.find((item) => item.id === step.id);
        if (!section)
          return <p className={styles.muted}>{t('Generate again to fill this step.')}</p>;
        return (
          <>
            {section.body && <p className={styles.text}>{section.body}</p>}
            {section.items.length > 0 && (
              <ul className={styles.list}>
                {section.items.map((item, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: stored analysis order is fixed
                  <li key={`${index}-${item.area}`}>
                    <strong>{item.area}</strong>
                    {link(item.location)}
                    <span className={styles.reason}>{item.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            {section.diagram && section.diagram.nodes.length > 0 && graph(section.diagram)}
          </>
        );
      }
    }
  };
  const cards = plan.steps
    .filter((step) => step.visible)
    .map((step) => ({ step, body: content(step) }))
    .filter(({ body }) => body !== null);
  return (
    <div className={styles.review}>
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
  changedPaths,
  onOpenLocation,
  link,
}: {
  architecture: Architecture;
  changedPaths: ReadonlySet<string>;
  onOpenLocation(location: CodeLocation): void;
  link(location: CodeLocation | undefined): ReactNode;
}) {
  const t = useT();
  const scheme = useAppearance().theme.kind;
  const source = useMemo(() => architectureToMermaid(architecture, scheme), [architecture, scheme]);
  return (
    <>
      <MermaidDiagram
        source={source.source}
        label={t('Components around this change')}
        onElementClick={(elementId) => {
          const index = nodeIndexFromElementId(elementId);
          const location = index === undefined ? undefined : architecture.nodes[index]?.location;
          if (location && changedPaths.has(location.path)) onOpenLocation(location);
        }}
      />
      <ul className={styles.list}>
        {architecture.nodes.map((node) => (
          <li key={node.id}>
            <span>{node.label}</span>
            {node.status !== 'unchanged' && (
              <span className={styles.status} data-status={node.status}>
                {t(node.status)}
              </span>
            )}
            {link(node.location)}
          </li>
        ))}
      </ul>
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
