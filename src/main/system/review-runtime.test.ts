import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createReviewRuntime, runtimeEnvironment, sandboxRun } from './review-runtime';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
describe.skipIf(process.platform !== 'darwin')('macOS isolated Node execution', () => {
  it('blocks private reads, writes, child processes and direct network access without leaking parent credentials', async () => {
    const runtime = createReviewRuntime();
    expect(await runtime.support()).toMatchObject({ available: true });
    const node = await runtime.node();
    const root = await realpath(await mkdtemp(join(tmpdir(), 'plot-runtime-test-')));
    roots.push(root);
    const source = join(root, 'source');
    const scratch = join(root, 'scratch');
    const harness = join(root, 'harness');
    await Promise.all([mkdir(source), mkdir(scratch), mkdir(harness)]);
    const sentinel = join(root, 'private.txt');
    await writeFile(sentinel, 'private sentinel');
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = address && typeof address !== 'string' ? address.port : 0;
    const script = join(harness, 'probe.mjs');
    await writeFile(
      script,
      `import fs from 'node:fs'; import cp from 'node:child_process'; import net from 'node:net';
      const results=[];
      for (const call of [()=>fs.readFileSync(${JSON.stringify(sentinel)}),()=>fs.writeFileSync(${JSON.stringify(join(source, 'forbidden.txt'))},'bad'),()=>cp.execFileSync('/bin/echo',['bad'])]) {
        try { call(); results.push('ALLOWED'); } catch(e) { results.push(e.code); }
      }
      results.push(await new Promise(resolve=>{const s=net.connect(${port},'127.0.0.1'); s.on('connect',()=>{resolve('ALLOWED');s.destroy()});s.on('error',e=>resolve(e.code));s.setTimeout(1000,()=>{resolve('TIMEOUT');s.destroy()})}));
      results.push(Object.keys(process.env).sort()); console.log(JSON.stringify(results));`,
    );
    try {
      const result = await sandboxRun({ node, cwd: source, scratch, harness, args: [script] });
      expect(result.status, result.stderr).toBe('completed');
      const values = JSON.parse(result.stdout);
      expect(values.slice(0, 4)).toEqual(['EPERM', 'EPERM', 'EPERM', 'EPERM']);
      expect(values[4]).toEqual(Object.keys(runtimeEnvironment(node, scratch)).sort());
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 15_000);
  it('terminates infinite loops on timeout and cancellation', async () => {
    const runtime = createReviewRuntime();
    const node = await runtime.node();
    const root = await realpath(await mkdtemp(join(tmpdir(), 'plot-runtime-limit-')));
    roots.push(root);
    const script = join(root, 'loop.mjs');
    await writeFile(script, 'while(true) {}');
    const result = await sandboxRun({
      node,
      cwd: root,
      scratch: root,
      harness: root,
      args: [script],
      timeoutMs: 100,
    });
    expect(result.status).toBe('timeout');
    const controller = new AbortController();
    const pending = sandboxRun({
      node,
      cwd: root,
      scratch: root,
      harness: root,
      args: [script],
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 100);
    expect((await pending).status).toBe('cancelled');
  }, 15_000);
});
