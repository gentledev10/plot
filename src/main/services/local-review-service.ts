import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BlobContent, ChangedFile } from '@shared/diff';
import { type Language, promptLanguage } from '@shared/language';
import type { LocalTarget } from '@shared/local';
import type { ReviewStatus, StoredReview } from '@shared/review';
import {
  defaultReviewPlan,
  parseReviewPlan,
  type ReviewPlan,
  reviewContentKey,
} from '@shared/review-plan';
import { ensureArchitectureGroups } from '../ai/architecture-groups';
import {
  createLocalReviewContext,
  LOCAL_REVIEW_LIMITS,
  validateLocalReviewFiles,
} from '../ai/local-review-context';
import { verifyLocations } from '../ai/review-locations';
import { buildReviewPrompt } from '../ai/review-prompt';
import { parseReviewMap, REVIEW_SCHEMA } from '../ai/review-schema';
import { linkReviewUnits } from '../ai/review-unit-schema';
import { AppError, toErrorPayload } from '../errors';
import type { LocalService } from './local-service';
import type { SelectedAgent } from './review-service';

interface Options {
  local: Pick<
    LocalService,
    'getLocalDiff' | 'getLocalSignature' | 'readLocalBlob' | 'readLocalFile'
  >;
  resolveAgent(): Promise<SelectedAgent>;
  workspaceRoot: string;
  cacheRoot: string;
  language(): Promise<Language>;
  plan?(): Promise<ReviewPlan>;
}
export interface LocalReviewService {
  startLocalReview(target: LocalTarget): Promise<void>;
  getLocalReviewStatus(target: LocalTarget): Promise<ReviewStatus>;
  cancelLocalReview(target: LocalTarget): Promise<void>;
}
interface Job {
  controller: AbortController;
  language: Language;
  planKey: string;
  status: ReviewStatus;
}
function configuredReview(
  output: unknown,
  plan: ReviewPlan,
  files: ChangedFile[],
  language: Language,
) {
  const parsed = linkReviewUnits(parseReviewMap(output), new Set(files.map((file) => file.path)));
  const customIds = new Set(
    plan.steps.filter((step) => step.kind === 'custom').map((step) => step.id),
  );
  if ([...customIds].some((id) => !parsed.customSections?.some((section) => section.id === id)))
    throw new AppError(
      'ai-invalid-output',
      'The local AI overview did not include every custom step. Generate it again.',
    );
  const kinds = new Set(plan.steps.map((step) => step.kind));
  return {
    ...parsed,
    summary: kinds.has('summary') ? parsed.summary : '',
    changes: kinds.has('changes') ? parsed.changes : [],
    ...(parsed.units ? { units: kinds.has('changes') ? parsed.units : [] } : {}),
    ...(parsed.simulations ? { simulations: kinds.has('changes') ? parsed.simulations : [] } : {}),
    flows: kinds.has('flows') ? parsed.flows : [],
    architecture: kinds.has('architecture')
      ? ensureArchitectureGroups(parsed.architecture, language)
      : { nodes: [], edges: [] },
    ...(parsed.visuals ? { visuals: kinds.has('architecture') ? parsed.visuals : [] } : {}),
    impacts: kinds.has('impacts') ? parsed.impacts : [],
    ...(parsed.reviewPoints
      ? { reviewPoints: kinds.has('reviewPoints') ? parsed.reviewPoints : [] }
      : {}),
    readingOrder: kinds.has('readingOrder') ? parsed.readingOrder : [],
    ...(parsed.customSections
      ? { customSections: parsed.customSections.filter((section) => customIds.has(section.id)) }
      : {}),
  };
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const targetKey = (target: LocalTarget) =>
  JSON.stringify(Object.fromEntries(Object.entries(target).sort(([a], [b]) => a.localeCompare(b))));
const checkpoint = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new AppError('ai-cancelled', 'The local AI overview was cancelled.');
};

export function createLocalReviewService(options: Options): LocalReviewService {
  const jobs = new Map<string, Job>();
  const pendingStarts = new Map<string, Set<AbortController>>();
  const clearJob = (key: string, job: Job) => {
    if (jobs.get(key) === job) jobs.delete(key);
  };
  async function capture(target: LocalTarget, signal?: AbortSignal) {
    checkpoint(signal);
    const start = await options.local.getLocalSignature(target);
    const diff = await options.local.getLocalDiff(target);
    validateLocalReviewFiles(diff.files);
    const before = new Map<string, BlobContent>();
    const after = new Map<string, BlobContent>();
    let bytes = 0;
    const digest = createHash('sha256').update(JSON.stringify([targetKey(target), start, diff]));
    const read = async (file: ChangedFile, side: 'before' | 'after') => {
      checkpoint(signal);
      const blob = side === 'before' ? file.oldBlob : file.newBlob;
      const content = blob
        ? await options.local.readLocalBlob(target.repositoryId, blob)
        : await options.local.readLocalFile(target.repositoryId, file.path);
      checkpoint(signal);
      if (content.kind !== 'text')
        throw new AppError(
          'ai-failed',
          'Local AI overviews require text files within the snapshot size limits.',
        );
      const size = Buffer.byteLength(content.text);
      bytes += size;
      if (size > LOCAL_REVIEW_LIMITS.fileBytes || bytes > LOCAL_REVIEW_LIMITS.totalBytes)
        throw new AppError(
          'ai-failed',
          'The selected local diff exceeds the AI snapshot size limit.',
        );
      digest.update(JSON.stringify([file.path, side, content.text]));
      return content;
    };
    for (const file of diff.files) {
      if (file.oldBlob) before.set(file.path, await read(file, 'before'));
      if (file.status !== 'deleted') after.set(file.path, await read(file, 'after'));
    }
    if (start !== (await options.local.getLocalSignature(target)))
      throw new AppError(
        'ai-cancelled',
        'Local changes moved while taking a snapshot. Generate again.',
      );
    return { files: diff.files, signature: digest.digest('hex'), before, after };
  }
  const identity = (target: LocalTarget, signature: string, language: Language, plan: ReviewPlan) =>
    hash(JSON.stringify([targetKey(target), signature, language, reviewContentKey(plan)]));
  async function execute(
    target: LocalTarget,
    key: string,
    job: Job,
    language: Language,
    plan: ReviewPlan,
  ) {
    let context: Awaited<ReturnType<typeof createLocalReviewContext>> | undefined;
    try {
      const snapshot = await capture(target, job.controller.signal);
      const files = snapshot.files;
      if (!files.length)
        throw new AppError('ai-failed', 'There are no selected local changes to explain.');
      context = await createLocalReviewContext({
        root: options.workspaceRoot,
        files,
        readBefore: async (file) => snapshot.before.get(file.path) ?? { kind: 'text', text: '' },
        readAfter: async (file) => snapshot.after.get(file.path) ?? { kind: 'text', text: '' },
        signal: job.controller.signal,
      });
      const selected = await options.resolveAgent();
      checkpoint(job.controller.signal);
      const result = await selected.agent.run({
        cwd: context.cwd,
        contextDir: context.contextDir,
        prompt: `This is a local comparison, not a pull request. Only selected file snapshots are available; do not assume broader repository context. References to PR head and merge base in the format instructions mean the selected after and before snapshots.\n${buildReviewPrompt({ files, contextDir: context.contextDir, language: promptLanguage(language), plan })}`,
        schema: REVIEW_SCHEMA,
        signal: job.controller.signal,
        model: selected.model,
        effort: selected.effort,
        apiKey: selected.apiKey,
        onActivity: (activity) => {
          if (job.status.state === 'running')
            job.status.activity = [...job.status.activity, activity].slice(-50);
        },
      });
      checkpoint(job.controller.signal);
      if ((await capture(target, job.controller.signal)).signature !== snapshot.signature) {
        clearJob(key, job);
        return;
      }
      const stored: StoredReview = {
        language,
        planKey: reviewContentKey(plan),
        head: snapshot.signature,
        review: verifyLocations(configuredReview(result.output, plan, files, language), (path) =>
          context?.lines.get(path),
        ),
        createdAt: new Date().toISOString(),
        provider: selected.provider,
        model: selected.model,
        costUsd: result.costUsd,
      };
      await mkdir(options.cacheRoot, { recursive: true, mode: 0o700 });
      const destination = join(
        options.cacheRoot,
        `${identity(target, snapshot.signature, language, plan)}.json`,
      );
      const temporary = `${destination}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify({ version: 1, ...stored }), { mode: 0o600 });
      checkpoint(job.controller.signal);
      await rename(temporary, destination);
      clearJob(key, job);
    } catch (error) {
      if (
        job.controller.signal.aborted ||
        (error instanceof AppError && error.code === 'ai-cancelled')
      )
        clearJob(key, job);
      else job.status = { state: 'failed', error: toErrorPayload(error) };
    } finally {
      await context?.dispose();
    }
  }
  return {
    async getLocalReviewStatus(target) {
      const key = targetKey(target);
      const [language, plan] = await Promise.all([
        options.language(),
        options.plan?.() ?? Promise.resolve(defaultReviewPlan()),
      ]);
      const job = jobs.get(key);
      if (job && job.language === language && job.planKey === reviewContentKey(plan))
        return job.status;
      const snapshot = await capture(target);
      try {
        const text = await readFile(
          join(options.cacheRoot, `${identity(target, snapshot.signature, language, plan)}.json`),
          'utf8',
        );
        if (Buffer.byteLength(text) > 4 * 1024 * 1024) return { state: 'idle' };
        const stored = JSON.parse(text);
        if (
          stored.version !== 1 ||
          stored.head !== snapshot.signature ||
          stored.language !== language ||
          stored.planKey !== reviewContentKey(plan)
        )
          return { state: 'idle' };
        return {
          state: 'done',
          ...stored,
          review: verifyLocations(parseReviewMap(stored.review), (path) => {
            const content = snapshot.after.get(path);
            return content?.kind === 'text' ? content.text.split('\n').length : undefined;
          }),
        };
      } catch {
        return { state: 'idle' };
      }
    },
    async startLocalReview(target) {
      const key = targetKey(target);
      const controller = new AbortController();
      const pending = pendingStarts.get(key) ?? new Set<AbortController>();
      for (const previous of pending) previous.abort();
      pending.add(controller);
      pendingStarts.set(key, pending);
      const [language, requestedPlan] = await (async () => {
        try {
          return await Promise.all([
            options.language(),
            options.plan?.() ?? Promise.resolve(defaultReviewPlan()),
          ]);
        } finally {
          pending.delete(controller);
          if (!pending.size && pendingStarts.get(key) === pending) pendingStarts.delete(key);
        }
      })();
      if (controller.signal.aborted) return;
      const plan = parseReviewPlan(requestedPlan);
      if (
        !plan.steps.length ||
        plan.steps.some(
          (step) => step.kind === 'custom' && !step.title.trim() && !step.instructions.trim(),
        )
      )
        throw new AppError(
          'ai-not-configured',
          'Add a review step and instructions before generating.',
        );
      const planKey = reviewContentKey(plan);
      const previous = jobs.get(key);
      if (
        previous?.status.state === 'running' &&
        !previous.controller.signal.aborted &&
        previous.language === language &&
        previous.planKey === planKey
      )
        return;
      previous?.controller.abort();
      const job: Job = {
        controller,
        language,
        planKey,
        status: { state: 'running', startedAt: new Date().toISOString(), activity: [] },
      };
      jobs.set(key, job);
      void execute(target, key, job, language, plan);
    },
    async cancelLocalReview(target) {
      const key = targetKey(target);
      for (const controller of pendingStarts.get(key) ?? []) controller.abort();
      jobs.get(key)?.controller.abort();
    },
  };
}
