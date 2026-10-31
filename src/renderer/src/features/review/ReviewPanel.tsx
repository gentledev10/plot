import { AI_PROVIDERS, type AiProviderId } from '@shared/ai';
import type { PullRequestRef } from '@shared/github';
import type { CodeLocation, Flow, ReviewMap, ReviewStatus } from '@shared/review';
import { CircleAlert, LoaderCircle, Maximize2, Minimize2, RotateCw, Sparkles } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { IconButton } from '../../components/IconButton';
import { StatusMessage } from '../../components/StatusMessage';
import { useColorScheme } from '../../lib/color-scheme';
import { formatAge } from '../../lib/format';
import { useAiSettings } from '../ai/queries';
import { usePullRequestDiff } from '../diff/queries';
import { useCommand, useShortcutLabel, withShortcut } from '../keymap/KeymapProvider';
import { MermaidDiagram } from './MermaidDiagram';
import {
  architectureToMermaid,
  compareFlow,
  nodeIndexFromElementId,
  sequenceToMermaid,
} from './mermaid-source';
import { useReviewActions, useReviewStatus } from './queries';
import styles from './ReviewPanel.module.css';

interface ReviewPanelProps {
  target?: PullRequestRef;
  onOpenLocation(location: CodeLocation): void;
  onConfigureAi?(): void;
  maximized?: boolean;
  onToggleMaximize?(): void;
}

interface Maximizing {
  maximized?: boolean;
  onToggleMaximize?(): void;
}

export function ReviewPanel({
  target,
  onOpenLocation,
  onConfigureAi,
  maximized = false,
  onToggleMaximize,
}: ReviewPanelProps) {
  const maximizing = { maximized, onToggleMaximize };
  return (
    <aside className={styles.panel} aria-label="AI overview" data-maximized={maximized}>
      {target ? (
        <PullRequestReview
          target={target}
          onOpenLocation={onOpenLocation}
          onConfigureAi={onConfigureAi}
          {...maximizing}
        />
      ) : (
        <>
          <PanelHeader {...maximizing} />
          <StatusMessage>Open a pull request to get an overview of its changes.</StatusMessage>
        </>
      )}
    </aside>
  );
}

function PanelHeader({
  onRegenerate,
  maximized,
  onToggleMaximize,
}: Maximizing & { onRegenerate?(): void }) {
  const shortcut = useShortcutLabel('view.maximizeReview');
  return (
    <header className={styles.header}>
      <h2 className={styles.title}>AI overview</h2>
      <span className={styles.headerActions}>
        {onRegenerate && (
          <IconButton label="Generate again" onClick={onRegenerate}>
            <RotateCw size={14} />
          </IconButton>
        )}
        {onToggleMaximize && (
          <IconButton
            label={withShortcut(maximized ? 'Restore' : 'Maximize', shortcut)}
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
}

function PullRequestReview({
  target,
  onOpenLocation,
  onConfigureAi,
  ...maximizing
}: PullRequestReviewProps) {
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
      <PanelHeader onRegenerate={done ? generate : undefined} {...maximizing} />
      <div className={styles.content}>{renderBody()}</div>
    </>
  );

  function renderBody() {
    if (status.isPending) {
      return <StatusMessage>Checking for a saved overview…</StatusMessage>;
    }
    if (status.isError) {
      return (
        <StatusMessage
          tone="error"
          title="Could not load the overview"
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
          <StatusMessage tone="error" title="Could not make the overview" onRetry={generate}>
            {current.error.message}
          </StatusMessage>
        );
      case 'done':
        return (
          <>
            <ReviewMapView
              review={current.review}
              changedPaths={changedPaths}
              onOpenLocation={onOpenLocation}
            />
            <p className={styles.footnote}>
              Generated
              {current.provider && ` by ${AI_PROVIDERS[current.provider].name}`}
              {current.model && ` (${current.model})`} {formatAge(current.createdAt)}
              {current.costUsd !== undefined && <span>, cost ${current.costUsd.toFixed(2)}</span>}
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
  const name = provider ? AI_PROVIDERS[provider].name : 'Your AI tool';
  return (
    <div className={styles.intro}>
      <p>
        Understand this change before reading the diff: what it changes, how the flow differs from
        before, and the architecture around it. Every item links to the code.
      </p>
      <button type="button" className={styles.primary} onClick={onGenerate} disabled={busy}>
        <Sparkles size={14} /> Explain this change
      </button>
      <p className={styles.muted}>
        {name} reads this pull request and the directories it touches on this Mac, with read-only
        access. It takes a minute or two and counts toward your {name} usage.
        {onConfigure && (
          <>
            {' '}
            <button type="button" className={styles.link} onClick={onConfigure}>
              Choose another AI tool
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
  const elapsed = useElapsed(startedAt);
  return (
    <div className={styles.progress} role="status">
      <div className={styles.progressHeader}>
        <LoaderCircle size={14} className={styles.spinner} />
        <span>Reading the change… {elapsed}</span>
        <button type="button" className={styles.secondary} onClick={onCancel}>
          Cancel
        </button>
      </div>
      <ol className={styles.activity}>
        {activity.slice(-8).map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: activity entries repeat and only ever append
          <li key={`${index}-${item}`}>{item}</li>
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
  const scheme = useColorScheme();
  const architecture = useMemo(
    () => architectureToMermaid(review.architecture, scheme),
    [review.architecture, scheme],
  );
  const link = (location: CodeLocation | undefined) =>
    location && (
      <LocationLink location={location} changedPaths={changedPaths} onOpen={onOpenLocation} />
    );

  return (
    <div className={styles.review}>
      <section aria-labelledby="overview-summary">
        <h3 id="overview-summary">Summary</h3>
        <p className={styles.text}>{review.summary}</p>
      </section>

      {review.changes.length > 0 && (
        <section aria-labelledby="overview-changes">
          <h3 id="overview-changes">What changed</h3>
          <ul className={styles.changes}>
            {review.changes.map((change, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a stored overview never changes order, and titles can repeat
              <li key={`${index}-${change.title}`} className={styles.change}>
                <strong>{change.title}</strong>
                {link(change.location)}
                <dl className={styles.beforeAfter}>
                  {change.before && (
                    <>
                      <dt>Before</dt>
                      <dd>{change.before}</dd>
                    </>
                  )}
                  {change.after && (
                    <>
                      <dt>Now</dt>
                      <dd>{change.after}</dd>
                    </>
                  )}
                </dl>
              </li>
            ))}
          </ul>
        </section>
      )}

      {review.flows.map((flow, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a stored overview never changes order, and titles can repeat
        <FlowView key={`${index}-${flow.title}`} flow={flow} link={link} />
      ))}

      {review.architecture.nodes.length > 0 && (
        <section aria-labelledby="overview-architecture">
          <h3 id="overview-architecture">Architecture</h3>
          <MermaidDiagram
            source={architecture.source}
            label="Components around this change"
            onElementClick={(elementId) => {
              const index = nodeIndexFromElementId(elementId);
              const location =
                index === undefined ? undefined : review.architecture.nodes[index]?.location;
              if (location && changedPaths.has(location.path)) {
                onOpenLocation(location);
              }
            }}
          />
          <ul className={styles.list}>
            {review.architecture.nodes.map((node) => (
              <li key={node.id}>
                <span>{node.label}</span>
                {node.status !== 'unchanged' && (
                  <span className={styles.status} data-status={node.status}>
                    {node.status}
                  </span>
                )}
                {link(node.location)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {review.impacts.length > 0 && (
        <section aria-labelledby="overview-impacts">
          <h3 id="overview-impacts">What else it affects</h3>
          <ul className={styles.list}>
            {review.impacts.map((impact, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a stored overview never changes order, and areas can repeat
              <li key={`${index}-${impact.area}`}>
                <strong>{impact.area}</strong>
                {link(impact.location)}
                <span className={styles.reason}>{impact.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {review.readingOrder.length > 0 && (
        <section aria-labelledby="overview-reading-order">
          <h3 id="overview-reading-order">Where to start reading</h3>
          <ol className={styles.list}>
            {review.readingOrder.map((step) => (
              <li key={step.path}>
                {link({ path: step.path, line: 1, verified: true })}
                <span className={styles.reason}>{step.reason}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

interface FlowViewProps {
  flow: Flow;
  link(location: CodeLocation | undefined): ReactNode;
}

function FlowView({ flow, link }: FlowViewProps) {
  const comparison = useMemo(() => compareFlow(flow), [flow]);
  const both = flow.before.length > 0 && flow.after.length > 0;
  return (
    <section aria-label={`Flow: ${flow.title}`}>
      <h3>{flow.title}</h3>
      {!both && (
        <p className={styles.muted}>
          {flow.before.length === 0
            ? 'A new flow added by this change.'
            : 'A flow this change removes.'}
        </p>
      )}
      <div className={styles.flowPair}>
        {flow.before.length > 0 && (
          <div>
            {both && <h4 className={styles.side}>Before</h4>}
            <MermaidDiagram
              source={sequenceToMermaid(flow.before, comparison.removed, 'removed')}
              label={`How ${flow.title} worked before`}
            />
          </div>
        )}
        {flow.after.length > 0 && (
          <div>
            {both && <h4 className={styles.side}>Now</h4>}
            <MermaidDiagram
              source={sequenceToMermaid(flow.after, comparison.added, 'added')}
              label={`How ${flow.title} works now`}
            />
          </div>
        )}
      </div>
      {both && (comparison.added.size > 0 || comparison.removed.size > 0) && (
        <p className={styles.legend}>
          <span className={styles.swatch} data-highlight="removed" /> Removed{' '}
          <span className={styles.swatch} data-highlight="added" /> Added
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
  const text = location.line > 1 ? `${location.path}:${location.line}` : location.path;
  const unverified = location.verified === false && (
    <span
      className={styles.unverified}
      title="The AI pointed at a line that does not exist in this pull request."
    >
      <CircleAlert size={12} /> unverified
    </span>
  );
  if (!changedPaths.has(location.path)) {
    return (
      <span className={styles.location} title="This file is not changed in this pull request.">
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
