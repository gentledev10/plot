import type { PullRequestRef } from '@shared/github';
import type { CodeLocation, ReviewMap, ReviewStatus } from '@shared/review';
import { CircleAlert, LoaderCircle, RotateCw, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { IconButton } from '../../components/IconButton';
import { StatusMessage } from '../../components/StatusMessage';
import { useColorScheme } from '../../lib/color-scheme';
import { formatRelativeTime } from '../../lib/format';
import { usePullRequestDiff } from '../diff/queries';
import { useCommand } from '../keymap/KeymapProvider';
import { MermaidDiagram } from './MermaidDiagram';
import { architectureToMermaid, flowToMermaid, nodeIndexFromElementId } from './mermaid-source';
import { useReviewActions, useReviewStatus } from './queries';
import styles from './ReviewPanel.module.css';

interface ReviewPanelProps {
  target?: PullRequestRef;
  onOpenLocation(location: CodeLocation): void;
}

export function ReviewPanel({ target, onOpenLocation }: ReviewPanelProps) {
  return (
    <aside className={styles.panel} aria-label="AI review">
      {target ? (
        <PullRequestReview target={target} onOpenLocation={onOpenLocation} />
      ) : (
        <>
          <PanelHeader />
          <StatusMessage>Open a pull request to generate a review map.</StatusMessage>
        </>
      )}
    </aside>
  );
}

function PanelHeader({ onRegenerate }: { onRegenerate?(): void }) {
  return (
    <header className={styles.header}>
      <h2 className={styles.title}>AI review</h2>
      {onRegenerate && (
        <IconButton label="Generate again" onClick={onRegenerate}>
          <RotateCw size={14} />
        </IconButton>
      )}
    </header>
  );
}

interface PullRequestReviewProps {
  target: PullRequestRef;
  onOpenLocation(location: CodeLocation): void;
}

function PullRequestReview({ target, onOpenLocation }: PullRequestReviewProps) {
  const status = useReviewStatus(target);
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
      <PanelHeader onRegenerate={done ? generate : undefined} />
      <div className={styles.content}>{renderBody()}</div>
    </>
  );

  function renderBody() {
    if (status.isPending) {
      return <StatusMessage>Checking for a saved review…</StatusMessage>;
    }
    if (status.isError) {
      return (
        <StatusMessage
          tone="error"
          title="Could not load the review"
          onRetry={() => void status.refetch()}
        >
          {status.error.message}
        </StatusMessage>
      );
    }
    const current: ReviewStatus = status.data;
    switch (current.state) {
      case 'idle':
        return <Introduction onGenerate={generate} busy={start.isPending} />;
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
          <StatusMessage tone="error" title="Could not generate the review" onRetry={generate}>
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
              Generated {formatRelativeTime(current.createdAt)} ago
              {current.costUsd !== undefined && <span>, cost ${current.costUsd.toFixed(2)}</span>}
            </p>
          </>
        );
    }
  }
}

function Introduction({ onGenerate, busy }: { onGenerate(): void; busy: boolean }) {
  return (
    <div className={styles.intro}>
      <p>
        Get a summary, a reading order, flow and architecture diagrams, and the places worth a
        closer look. Every item links to the code.
      </p>
      <button type="button" className={styles.primary} onClick={onGenerate} disabled={busy}>
        <Sparkles size={14} /> Generate review map
      </button>
      <p className={styles.muted}>
        Claude Code reads this pull request and the directories it touches on this Mac, with
        read-only tools. It takes a few minutes and uses your Claude Code plan.
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
        <span>Reviewing… {elapsed}</span>
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
      <section aria-labelledby="review-summary">
        <h3 id="review-summary">Summary</h3>
        <p className={styles.text}>{review.summary}</p>
      </section>

      {review.readingOrder.length > 0 && (
        <section aria-labelledby="review-reading-order">
          <h3 id="review-reading-order">Reading order</h3>
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

      {review.flows.map((flow, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a stored review never changes order, and titles can repeat
        <section key={`${index}-${flow.title}`} aria-label={`Flow: ${flow.title}`}>
          <h3>{flow.title}</h3>
          <MermaidDiagram
            source={flowToMermaid(flow)}
            label={`Sequence diagram of ${flow.title}`}
          />
          <ol className={styles.list}>
            {flow.steps.map((step, stepIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a stored review never changes order, and labels can repeat
              <li key={`${stepIndex}-${step.label}`}>
                <span>
                  {step.from} → {step.to}: {step.label}
                </span>
                {link(step.location)}
              </li>
            ))}
          </ol>
        </section>
      ))}

      {review.architecture.nodes.length > 0 && (
        <section aria-labelledby="review-architecture">
          <h3 id="review-architecture">Architecture</h3>
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
                <span className={node.changed ? styles.changed : undefined}>{node.label}</span>
                {node.changed && <span className={styles.tag}>changed</span>}
                {link(node.location)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {review.risks.length > 0 && (
        <section aria-labelledby="review-risks">
          <h3 id="review-risks">Worth a closer look</h3>
          <ul className={styles.list}>
            {review.risks.map((risk) => (
              <li key={risk.title} className={styles.risk}>
                <span className={styles.severity} data-severity={risk.severity}>
                  {risk.severity}
                </span>
                <strong>{risk.title}</strong>
                <span className={styles.reason}>{risk.detail}</span>
                {link(risk.location)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
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
