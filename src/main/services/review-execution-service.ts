import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import type { PullRequestRef } from '@shared/github';
import type { PlotApi } from '@shared/ipc';
import type { Language } from '@shared/language';
import { pullRequestKey } from '@shared/pull-request-ref';
import type { ReviewTask } from '@shared/review-activity';
import {
  type ExecutionReport,
  type ExecutionSide,
  type ExecutionStatus,
  NODE_TEST_PATH,
} from '@shared/review-execution';
import type { ReviewStore } from '../ai/review-store';
import { AppError, toErrorPayload } from '../errors';
import type { RepositoryCache } from '../git/repository-cache';
import type { GitHubConnections } from '../github/connections';
import { type ReviewRuntime, sandboxRun } from '../system/review-runtime';

interface Options {
  connections: GitHubConnections;
  repositories: RepositoryCache;
  reviews: ReviewStore;
  runtime: ReviewRuntime;
  root: string;
  language(): Promise<Language>;
}
type Job = { head: string; controller: AbortController; task: ReviewTask<ExecutionReport> };
export type ReviewExecutionService = Pick<
  PlotApi,
  | 'getReviewExecutionSupport'
  | 'getReviewExecution'
  | 'runReviewExecution'
  | 'cancelReviewExecution'
>;

const harnessSource = `import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const [packetPath, resultPath] = process.argv.slice(2);
const p = JSON.parse(await readFile(packetPath, 'utf8'));
let result;
try {
 const module = await import(pathToFileURL(p.path).href);
 const fn = module[p.exportName];
 if (typeof fn !== 'function') throw new Error('The bound export is not a function.');
 let value;
 try { value = await fn(...p.args); }
 catch(error) { result={kind:'throw',value:{name:String(error?.name ?? 'Error'),message:String(error?.message ?? error).slice(0,2000)}}; }
 if (!result) {
  if (value === undefined) result={kind:'return',value:null,valueType:'undefined'};
  else try {
   const json = JSON.stringify(value, (_key, item) => {
    if (['bigint','undefined','function','symbol'].includes(typeof item) || (typeof item === 'number' && !Number.isFinite(item))) throw new Error('The return value contains a non-JSON value.');
    return item;
   });
   result = json && json.length <= 32000 ? {kind:'return',value:JSON.parse(json)} : {kind:'setup-error',value:'The result is too large or cannot be represented as JSON.'};
  } catch(error) { result={kind:'setup-error',value:String(error?.message ?? error).slice(0,2000)}; }
 }
} catch(error) { result={kind:'setup-error',value:String(error?.message ?? error).slice(0,2000)}; }
await writeFile(resultPath, JSON.stringify(result));`;

export function createReviewExecutionService({
  connections,
  repositories,
  reviews,
  runtime,
  root,
  language,
}: Options): ReviewExecutionService {
  const jobs = new Map<string, Job>();
  const reports = new Map<string, ExecutionReport[]>();
  const current = async (ref: PullRequestRef) => {
    const { client } = await connections.forHost(ref.host);
    return { client, pull: await client.getPullRequest(ref) };
  };
  const reportKey = (ref: PullRequestRef, head: string) => `${pullRequestKey(ref)}:${head}`;
  return {
    getReviewExecutionSupport: () => runtime.support(),
    async getReviewExecution(ref): Promise<ExecutionStatus> {
      const { pull } = await current(ref);
      const head = pull.head.sha;
      const job = jobs.get(pullRequestKey(ref));
      return {
        head,
        reports: reports.get(reportKey(ref, head)) ?? [],
        task: job?.head === head ? job.task : { state: 'idle' },
      };
    },
    async cancelReviewExecution(ref) {
      const job = jobs.get(pullRequestKey(ref));
      job?.controller.abort();
      if (job) job.task = { state: 'idle' };
    },
    async runReviewExecution(ref, request) {
      const { client, pull } = await current(ref);
      if (pull.head.sha !== request.head)
        throw new AppError(
          'invalid-argument',
          'The PR changed. Refresh the diff before starting this activity.',
        );
      const node = await runtime.node();
      const support = await runtime.support();
      const saved = await reviews.read(ref, request.head, await language());
      const unit = request.unitId
        ? saved?.review.units?.find((u) => u.id === request.unitId)
        : undefined;
      if (request.unitId && !unit)
        throw new AppError('invalid-argument', 'That review unit is no longer available.');
      const simulation =
        request.kind === 'scenario'
          ? saved?.review.simulations?.find((s) => s.id === request.simulationId)
          : undefined;
      if (
        request.kind === 'scenario' &&
        (!simulation?.binding ||
          (unit &&
            !unit.simulationIds.includes(simulation.id) &&
            !unit.changeTitles.includes(simulation.changeTitle)))
      )
        throw new AppError(
          'invalid-argument',
          'This model has no executable function binding. Generate the review again or use the explanation model.',
        );
      if (
        request.kind === 'scenario' &&
        (request.inputs.length !== simulation?.inputs.length ||
          simulation.inputs.some((i) => !request.inputs.some((v) => v.id === i.id)))
      )
        throw new AppError('invalid-argument', 'Supply one value for every model input.');
      const id = pullRequestKey(ref);
      if (jobs.get(id)?.task.state === 'running')
        throw new AppError('invalid-argument', 'An execution is already running for this PR.');
      const controller = new AbortController();
      const job: Job = {
        head: request.head,
        controller,
        task: {
          state: 'running',
          startedAt: new Date().toISOString(),
          activity: ['Preparing isolated code snapshots'],
          unitId: request.unitId,
        },
      };
      jobs.set(id, job);
      void (async () => {
        let directory: string | undefined;
        const checkouts: string[] = [];
        try {
          const base = await client.getMergeBase(ref, pull.base.sha, request.head);
          await repositories.fetchCommits(ref, [base, request.head]);
          directory = join(root, randomUUID());
          await mkdir(directory, { recursive: true });
          directory = await realpath(directory);
          const beforeDir = join(directory, 'before');
          const afterDir = join(directory, 'after');
          for (const [commit, target] of [
            [base, beforeDir],
            [request.head, afterDir],
          ] as const) {
            if (controller.signal.aborted) return;
            const paths = await repositories.listFiles(ref, commit);
            if (paths.length > 20_000)
              throw new AppError(
                'invalid-argument',
                'This repository exceeds the isolated execution snapshot limit of 20,000 files.',
              );
            const directories = [
              ...new Set(
                paths.filter((p) => p.includes('/')).map((p) => p.split('/')[0] as string),
              ),
            ];
            checkouts.push(target);
            await repositories.checkoutDirectories(ref, commit, directories, target);
          }
          const files = await repositories.diff(ref, base, request.head);
          if (request.kind === 'tests') {
            for (const path of request.paths) {
              if (
                !NODE_TEST_PATH.test(path) ||
                !files.some((f) => f.path === path && f.newBlob && f.kind === 'file') ||
                (unit && !unit.files.some((f) => f.path === path))
              )
                throw new AppError(
                  'invalid-argument',
                  'Select changed Node test files from this review scope.',
                );
              const source = await safeFile(afterDir, path);
              const destination = await safeDestination(beforeDir, path);
              // Both versions run the exact same PR-head assertions, including newly added tests.
              await writeFile(destination, await readFile(source));
            }
          }
          const harness = join(directory, 'harness');
          await mkdir(harness);
          const script = join(harness, 'call.mjs');
          await writeFile(script, harnessSource, { mode: 0o600 });
          const execute = async (side: 'before' | 'after', cwd: string): Promise<ExecutionSide> => {
            if (job.task.state === 'running')
              job.task.activity = [`Executing ${side} version in the macOS sandbox`];
            const scratch = join(directory as string, `scratch-${side}`);
            await mkdir(scratch);
            let args: string[];
            const resultFile = join(scratch, 'result.json');
            if (request.kind === 'scenario' && simulation?.binding) {
              const binding = simulation.binding[side];
              const path = await safeFile(cwd, binding.path);
              const values = new Map(request.inputs.map((v) => [v.id, v.value]));
              const packet = join(harness, `${side}.json`);
              await writeFile(
                packet,
                JSON.stringify({
                  path,
                  exportName: binding.exportName,
                  args: binding.args.map((a) => ('input' in a ? values.get(a.input) : a.value)),
                }),
                { mode: 0o600 },
              );
              args = [script, packet, resultFile];
            } else if (request.kind === 'tests')
              args = [
                '--test',
                '--test-reporter=tap',
                '--test-isolation=none',
                '--test-timeout=20000',
                ...request.paths.map((p) => join(cwd, p)),
              ];
            else throw new Error('The execution binding is unavailable.');
            const result = await sandboxRun({
              node,
              cwd,
              scratch,
              harness,
              args,
              signal: controller.signal,
            });
            if (request.kind === 'tests') result.tests = parseTopLevelTests(result.stdout);
            if (request.kind === 'scenario' && result.status === 'completed') {
              try {
                const content = await readFile(resultFile, 'utf8');
                if (content.length > 40_000) throw new Error('Result too large');
                const parsed = JSON.parse(content);
                if (!['return', 'throw', 'setup-error'].includes(parsed.kind))
                  throw new Error('Invalid outcome');
                result.outcome = parsed;
                if (parsed.kind === 'setup-error') result.status = 'failed';
              } catch {
                result.status = 'failed';
                result.stderr += '\nThe function did not produce a readable result.';
              }
            }
            // Keep reproducible commands without local filesystem paths in saved/UI reports.
            result.command =
              request.kind === 'tests'
                ? [
                    'node',
                    '--test',
                    '--test-reporter=tap',
                    '--test-isolation=none',
                    '--test-timeout=20000',
                    ...request.paths,
                  ]
                : ['node', '<Plot function harness>'];
            return result;
          };
          const before = await execute('before', beforeDir);
          if (controller.signal.aborted) return;
          const after = await execute('after', afterDir);
          if (controller.signal.aborted) return;
          const report: ExecutionReport = {
            id: randomUUID(),
            base,
            head: request.head,
            unitId: request.unitId,
            createdAt: new Date().toISOString(),
            nodeVersion: support.nodeVersion ?? '',
            isolation: 'macos-sandbox',
            request,
            ...(simulation?.binding ? { binding: simulation.binding } : {}),
            before,
            after,
          };
          reports.set(
            reportKey(ref, request.head),
            [...(reports.get(reportKey(ref, request.head)) ?? []), report].slice(-20),
          );
          job.task = { state: 'done', result: report };
        } catch (error) {
          if (!controller.signal.aborted)
            job.task = { state: 'failed', error: toErrorPayload(error) };
        } finally {
          for (const checkout of checkouts)
            await repositories.removeCheckout(ref, checkout).catch(() => {});
          if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
        }
      })();
    },
  };
}

export function parseTopLevelTests(stdout: string): NonNullable<ExecutionSide['tests']> {
  return [...stdout.matchAll(/^(not )?ok \d+ - (.+)$/gm)].slice(0, 200).map((match) => ({
    name: (match[2] ?? '').replace(/ # (?:SKIP|TODO).*$/, '').slice(0, 500),
    status: / # (?:SKIP|TODO)/.test(match[2] ?? '') ? 'skipped' : match[1] ? 'failed' : 'passed',
  }));
}

async function safeFile(root: string, path: string): Promise<string> {
  if (
    isAbsolute(path) ||
    path.includes('\\') ||
    path.split('/').some((p) => !p || p === '..' || p === '.')
  )
    throw new Error('Invalid source path.');
  const file = await realpath(join(root, path));
  const rel = relative(root, file);
  if (!rel || rel.startsWith('../') || isAbsolute(rel) || !(await lstat(file)).isFile())
    throw new Error('The source file is outside the isolated snapshot.');
  return file;
}
async function safeDestination(root: string, path: string): Promise<string> {
  let directory = root;
  for (const part of path.split('/').slice(0, -1)) {
    directory = join(directory, part);
    await mkdir(directory, { recursive: true });
    if ((await lstat(directory)).isSymbolicLink())
      throw new Error('Test paths must not traverse symbolic links.');
  }
  const destination = join(root, path);
  try {
    if ((await lstat(destination)).isSymbolicLink())
      throw new Error('Test paths must not be symbolic links.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return destination;
}
