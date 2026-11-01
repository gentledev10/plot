import { writeFileSync } from 'node:fs';

const mode = process.env.FAKE_CODEX_MODE ?? 'success';
const args = process.argv.slice(2);
const outputFile = args[args.indexOf('--output-last-message') + 1];

function emit(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

emit({ type: 'thread.started', thread_id: 'thread-1' });
emit({ type: 'turn.started' });

if (mode === 'hang') {
  setInterval(() => {}, 1_000);
} else if (mode === 'crash') {
  process.stderr.write('Error: something broke\n');
  process.exit(2);
} else if (mode === 'signed-out') {
  emit({ type: 'error', message: 'Reconnecting... 1/5 (unexpected status 401 Unauthorized)' });
  emit({ type: 'turn.failed', error: { message: 'unexpected status 401 Unauthorized' } });
  process.exit(1);
} else {
  emit({
    type: 'item.started',
    item: {
      id: 'item_1',
      type: 'command_execution',
      command: `/bin/zsh -lc "sed -n '1,40p' ${process.cwd()}/src/app.ts"`,
      status: 'in_progress',
    },
  });
  emit({ type: 'item.completed', item: { id: 'item_2', type: 'agent_message', text: '{}' } });
  if (mode === 'success') {
    writeFileSync(
      outputFile,
      JSON.stringify({ summary: 'ok', args, apiKey: process.env.CODEX_API_KEY ?? null }),
    );
  } else if (mode === 'not-json') {
    writeFileSync(outputFile, 'Here is your review!');
  }
  emit({
    type: 'turn.completed',
    usage: { input_tokens: 1200, cached_input_tokens: 0, output_tokens: 300 },
  });
}
