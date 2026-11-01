import { readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AiProviderId } from '@shared/ai';
import type { ChangedFile } from '@shared/diff';
import type { ErrorPayload } from '@shared/errors';
import type { PullRequestRef } from '@shared/github';
import type { PlotApi } from '@shared/ipc';
import { type Language, promptLanguage } from '@shared/language';
import { pullRequestKey } from '@shared/pull-request-ref';
import {
  defaultReviewPlan,
  parseReviewPlan,
  type ReviewPlan,
  reviewContentKey,
} from '@shared/review-plan';
import type { ReviewAgent } from '../ai/agent';
import { verifyLocations } from '../ai/review-locations';
import { buildReviewPrompt, CONTEXT_FILES } from '../ai/review-prompt';
import { parseReviewMap, REVIEW_SCHEMA } from '../ai/review-schema';
import type { ReviewStore } from '../ai/review-store';
import { AppError, toErrorPayload } from '../errors';
import type { RepositoryCache } from '../git/repository-cache';
import type { GitHubConnections } from '../github/connections';

export type ReviewService = Pick<PlotApi, 'getReviewStatus' | 'startReview' | 'cancelReview'>;

export interface SelectedAgent {
  provider: AiProviderId;
  model?: string;
  effort?: string;
  apiKey?: string;
  agent: ReviewAgent;
}

interface ReviewServiceOptions {
  connections: GitHubConnections;
  repositories: RepositoryCache;
  resolveAgent(): Promise<SelectedAgent>;
  store: ReviewStore;
  workspaceRoot: string;
  language: Language | (() => Promise<Language>);
  plan?(): Promise<ReviewPlan>;
  now?(): Date;
  onUnexpectedError?(error: unknown): void;
}

type Job =
  | { state: 'running'; startedAt: string; activity: string[]; controller: AbortController }
  | { state: 'failed'; error: ErrorPayload };

const MAX_ACTIVITY = 50;

export function createReviewService({
  connections,
  repositories,
  resolveAgent,
  store,
  workspaceRoot,
  language,
  plan = async () => defaultReviewPlan(),
  now = () => new Date(),
  onUnexpectedError = () => {},
}: ReviewServiceOptions): ReviewService {
  const jobs = new Map<string, Job>();
  const currentLanguage = typeof language === 'function' ? language : async () => language;

  async function execute(
    ref: PullRequestRef,
    key: string,
    controller: AbortController,
    language: Language,
    reviewPlan: ReviewPlan,
  ) {
    const job = jobs.get(key);
    const note = (activity: string) => {
      if (job?.state === 'running') {
        job.activity = [...job.activity, activity].slice(-MAX_ACTIVITY);
      }
    };
    const checkpoint = () => {
      if (controller.signal.aborted) {
        throw new AppError('ai-cancelled', 'The AI review was cancelled.');
      }
    };
    const workspace = join(
      workspaceRoot,
      ref.host,
      ref.owner.toLowerCase(),
      ref.repo.toLowerCase(),
      String(ref.number),
    );
    const repoDir = join(workspace, 'repo');
    const contextDir = join(workspace, 'context');

    try {
      note('Checking the selected AI tool');
      const { provider, model, effort, apiKey, agent } = await resolveAgent();
      checkpoint();
      note('Loading the pull request');
      const { client } = await connections.forHost(ref.host);
      const pull = await client.getPullRequest(ref);
      const mergeBase = await client.getMergeBase(ref, pull.base.sha, pull.head.sha);
      await repositories.fetchCommits(ref, [mergeBase, pull.head.sha]);
      const files = await repositories.diff(ref, mergeBase, pull.head.sha);
      checkpoint();

      note('Checking out the changed directories');
      await removeWorkspace(ref, workspace, repoDir);
      await mkdir(contextDir, { recursive: true });
      await repositories.checkoutDirectories(ref, pull.head.sha, directoriesOf(files), repoDir);
      await writeFile(
        join(contextDir, CONTEXT_FILES.diff),
        await repositories.unifiedDiff(ref, mergeBase, pull.head.sha),
      );
      await writeFile(
        join(contextDir, CONTEXT_FILES.files),
        (await repositories.listFiles(ref, pull.head.sha)).join('\n'),
      );
      await writeFile(
        join(contextDir, CONTEXT_FILES.description),
        `# ${pull.title}\n\n${pull.body}\n`,
      );
      checkpoint();

      const result = await agent.run({
        cwd: repoDir,
        contextDir,
        prompt: buildReviewPrompt({
          files,
          contextDir,
          language: promptLanguage(language),
          plan: reviewPlan,
        }),
        schema: REVIEW_SCHEMA,
        model,
        effort,
        apiKey,
        signal: controller.signal,
        onActivity: note,
      });
      const parsed = parseReviewMap(result.output);
      const customIds = new Set(
        reviewPlan.steps.filter((step) => step.kind === 'custom').map((step) => step.id),
      );
      if (
        [...customIds].some((id) => !parsed.customSections?.some((section) => section.id === id))
      ) {
        throw new AppError(
          'ai-invalid-output',
          'The AI overview did not include every custom step. Generate it again.',
        );
      }
      if (parsed.customSections)
        parsed.customSections = parsed.customSections.filter((section) =>
          customIds.has(section.id),
        );
      const kinds = new Set(reviewPlan.steps.map((step) => step.kind));
      const review = verifyLocations(
        {
          ...parsed,
          summary: kinds.has('summary') ? parsed.summary : '',
          changes: kinds.has('changes') ? parsed.changes : [],
          flows: kinds.has('flows') ? parsed.flows : [],
          architecture: kinds.has('architecture') ? parsed.architecture : { nodes: [], edges: [] },
          impacts: kinds.has('impacts') ? parsed.impacts : [],
          ...(parsed.reviewPoints
            ? { reviewPoints: kinds.has('reviewPoints') ? parsed.reviewPoints : [] }
            : {}),
          readingOrder: kinds.has('readingOrder') ? parsed.readingOrder : [],
        },
        lineCounter(repoDir),
      );
      await store.write(ref, {
        language,
        planKey: reviewContentKey(reviewPlan),
        review,
        head: pull.head.sha,
        createdAt: now().toISOString(),
        provider,
        model,
        costUsd: result.costUsd,
      });
      jobs.delete(key);
    } catch (error) {
      if (error instanceof AppError && error.code === 'ai-cancelled') {
        jobs.delete(key);
      } else {
        if (!(error instanceof AppError)) {
          onUnexpectedError(error);
        }
        jobs.set(key, { state: 'failed', error: toErrorPayload(error) });
      }
    } finally {
      await removeWorkspace(ref, workspace, repoDir).catch(onUnexpectedError);
    }
  }

  async function removeWorkspace(ref: PullRequestRef, workspace: string, repoDir: string) {
    await repositories.removeCheckout(ref, repoDir);
    await rm(workspace, { recursive: true, force: true });
  }

  return {
    async getReviewStatus(ref) {
      const job = jobs.get(keyOf(ref));
      if (job?.state === 'running') {
        return { state: 'running', startedAt: job.startedAt, activity: job.activity };
      }
      if (job?.state === 'failed') {
        return { state: 'failed', error: job.error };
      }
      const requestedLanguage = await currentLanguage();
      const { client } = await connections.forHost(ref.host);
      const pull = await client.getPullRequest(ref);
      const stored = await store.read(ref, pull.head.sha, requestedLanguage);
      return stored ? { state: 'done', ...stored } : { state: 'idle' };
    },

    async startReview(ref) {
      const key = keyOf(ref);
      if (jobs.get(key)?.state === 'running') {
        return;
      }
      const language = await currentLanguage();
      const reviewPlan = parseReviewPlan(await plan());
      if (reviewPlan.steps.length === 0)
        throw new AppError(
          'ai-not-configured',
          'Add a review step or restore the defaults before generating.',
        );
      if (
        reviewPlan.steps.some(
          (step) => step.kind === 'custom' && !step.title.trim() && !step.instructions.trim(),
        )
      )
        throw new AppError(
          'ai-not-configured',
          'Give each custom step a title or instructions before generating.',
        );
      if (jobs.get(key)?.state === 'running') return;
      const controller = new AbortController();
      jobs.set(key, { state: 'running', startedAt: now().toISOString(), activity: [], controller });
      void execute(ref, key, controller, language, reviewPlan);
    },

    async cancelReview(ref) {
      const job = jobs.get(keyOf(ref));
      if (job?.state === 'running') {
        job.controller.abort();
      }
    },
  };
}

function keyOf(ref: PullRequestRef): string {
  return pullRequestKey(ref);
}

export function directoriesOf(files: readonly ChangedFile[]): string[] {
  const directories = new Set<string>();
  for (const file of files) {
    const directory = dirname(file.path);
    if (directory !== '.') {
      directories.add(directory);
    }
  }
  return [...directories].sort();
}

function lineCounter(repoDir: string) {
  const counts = new Map<string, number | undefined>();
  return (path: string) => {
    if (!counts.has(path)) {
      try {
        const text = readFileSync(join(repoDir, path), 'utf8');
        counts.set(path, text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0));
      } catch {
        counts.set(path, undefined);
      }
    }
    return counts.get(path);
  };
}
