import { createInterface } from 'node:readline';

const mode = process.env.PLOT_TEST_MODEL_MODE;
let usedKey = false;
createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line);
  if (!request.id || mode === 'hang') return;
  let result = {};
  if (request.method === 'account/login/start') usedKey = true;
  if (request.method === 'account/read')
    result = { account: { type: usedKey ? 'apiKey' : mode === 'retired' ? 'chatgpt' : 'apiKey' } };
  if (request.method === 'model/list') {
    if (mode === 'error') {
      process.stdout.write(
        `${JSON.stringify({ id: request.id, error: { message: 'private provider details' } })}\n`,
      );
      return;
    }
    result = {
      data: [
        {
          model:
            mode === 'retired'
              ? 'gpt-5.5'
              : request.params.cursor
                ? 'second-model'
                : 'available-model',
          displayName: 'Available model',
          supportedReasoningEfforts: [{ reasoningEffort: 'high' }],
          isDefault: true,
          debugHome: usedKey ? process.env.CODEX_HOME : null,
        },
      ],
      nextCursor: mode === 'pages' && !request.params.cursor ? 'page-two' : null,
    };
  }
  process.stdout.write(`${JSON.stringify({ id: request.id, result })}\n`);
});
