const mode = process.env.FAKE_CLAUDE_MODE ?? 'success';

function emit(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function tool(name, input) {
  emit({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
}

emit({ type: 'system', subtype: 'init' });

if (mode === 'hang') {
  setInterval(() => {}, 1_000);
} else if (mode === 'crash') {
  process.stderr.write('Error: something broke\n');
  process.exit(2);
} else {
  tool('Read', { file_path: `${process.cwd()}/src/app.ts` });
  tool('Grep', { pattern: 'UserService' });
  emit({ type: 'user', message: { content: [] } });
  if (mode === 'error') {
    emit({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      result: 'Usage limit reached.',
    });
  } else if (mode === 'no-output') {
    emit({ type: 'result', subtype: 'success', is_error: false, result: 'Done.' });
  } else {
    tool('StructuredOutput', { summary: 'ok' });
    emit({
      type: 'result',
      subtype: 'success',
      is_error: false,
      total_cost_usd: 0.42,
      structured_output: { summary: 'ok', args: process.argv.slice(2) },
    });
  }
}
