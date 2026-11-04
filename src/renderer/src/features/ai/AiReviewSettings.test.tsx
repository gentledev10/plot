import { type AiSettings, CLAUDE_CODE_MODELS } from '@shared/ai';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { AiReviewSettings } from './AiReviewSettings';

function setup(overrides: Parameters<typeof renderWithApi>[1] = {}) {
  let saved: AiSettings = { provider: 'claude-code', models: {}, efforts: {}, auth: {} };
  const updateAiSettings = vi.fn(async (settings: AiSettings) => {
    saved = settings;
    return settings;
  });
  const rendered = renderWithApi(<AiReviewSettings />, {
    getAiSettings: vi.fn(async () => saved),
    listAiModels: vi.fn().mockResolvedValue(CLAUDE_CODE_MODELS),
    detectAiProviders: vi.fn().mockResolvedValue([
      {
        id: 'claude-code',
        installed: true,
        version: '2.1.314 (Claude Code)',
        signedIn: true,
        apiKeySaved: false,
      },
      { id: 'codex', installed: false, apiKeySaved: false },
    ]),
    updateAiSettings,
    ...overrides,
  });
  return { ...rendered, updateAiSettings };
}

describe('AiReviewSettings', () => {
  it('describes reasoning effort without promising a separate charge for every request', async () => {
    setup();
    expect(
      await screen.findByText(/Higher reasoning effort may take longer and increase usage\./),
    ).toBeVisible();
    expect(
      screen.queryByText(/Higher effort thinks longer and costs more/),
    ).not.toBeInTheDocument();
  });

  it('reloads cached models and tool status after the user updates their CLI', async () => {
    const listAiModels = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', efforts: ['low'] }])
      .mockResolvedValue([{ id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', efforts: ['low'] }]);
    const { api } = setup({
      getAiSettings: vi.fn().mockResolvedValue({
        provider: 'codex',
        models: {},
        efforts: {},
        auth: {},
      }),
      listAiModels,
    });
    await screen.findByRole('option', { name: 'GPT-5.6 Sol' });
    expect(screen.queryByRole('option', { name: 'GPT-6.1 Sol' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reload models' }));
    expect(await screen.findByRole('option', { name: 'GPT-6.1 Sol' })).toBeInTheDocument();
    expect(listAiModels).toHaveBeenCalledTimes(2);
    expect(api.detectAiProviders).toHaveBeenCalledTimes(2);
  });

  it('shows the actual default model and its supported efforts from the live catalog', async () => {
    setup({
      getAiSettings: vi.fn().mockResolvedValue({
        provider: 'codex',
        models: {},
        efforts: {},
        auth: {},
      }),
      listAiModels: vi.fn().mockResolvedValue([
        {
          id: 'gpt-6.1-sol',
          name: 'GPT-6.1 Sol',
          efforts: ['low', 'high', 'ultra'],
          isDefault: true,
        },
        { id: 'gpt-6-astra', name: 'GPT-6 Astra', efforts: ['low', 'high'] },
      ]),
    });
    expect(await screen.findByRole('option', { name: 'Default (GPT-6.1 Sol)' })).toHaveProperty(
      'selected',
      true,
    );
    expect(screen.getByRole('option', { name: 'GPT-6 Astra' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ultra' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Medium' })).not.toBeInTheDocument();
  });

  it('explains automatic selection and keeps the tool chosen by the user', async () => {
    const { updateAiSettings } = setup({
      getAiSettings: vi.fn().mockResolvedValue({
        provider: 'codex',
        autoSelect: true,
        models: {},
        efforts: {},
        auth: {},
      }),
    });
    const automatic = await screen.findByRole('checkbox', {
      name: 'Choose an available tool automatically',
    });
    expect(automatic).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Codex CLI/ })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: /^Claude Code/ }));
    expect(updateAiSettings).toHaveBeenCalledWith({
      provider: 'claude-code',
      autoSelect: false,
      models: {},
      efforts: {},
      auth: {},
    });
    expect(automatic).not.toBeChecked();
  });

  it('shows which tools are installed and signed in', async () => {
    setup();

    expect(await screen.findByText(/2\.1\.314 \(Claude Code\)\. Signed in\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Install it' })).toHaveAttribute(
      'href',
      'https://github.com/openai/codex',
    );
  });

  it('tells how to sign in to a tool that is installed but signed out', async () => {
    setup({
      detectAiProviders: vi.fn().mockResolvedValue([
        { id: 'claude-code', installed: true, version: '2.1.314' },
        { id: 'codex', installed: true, version: 'codex-cli 0.166.0', signedIn: false },
      ]),
    });
    expect(await screen.findByText('codex login')).toBeInTheDocument();
  });

  it('switches the tool that makes review maps', async () => {
    const { updateAiSettings } = setup();
    const codex = await screen.findByRole('radio', { name: /^Codex CLI/ });
    await userEvent.click(codex);
    expect(codex).toBeChecked();
    expect(updateAiSettings).toHaveBeenCalledWith({
      provider: 'codex',
      models: {},
      efforts: {},
      auth: {},
    });
  });

  it('puts the previous choice back when saving fails', async () => {
    setup({ updateAiSettings: vi.fn().mockRejectedValue(new Error('Disk full.')) });
    const codex = await screen.findByRole('radio', { name: /^Codex CLI/ });
    await userEvent.click(codex);

    expect(await screen.findByRole('alert')).toHaveTextContent('Disk full.');
    expect(codex).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /^Claude Code/ })).toBeChecked();
  });

  it('saves the model picked from the list the tool offers', async () => {
    const { updateAiSettings } = setup();
    const model = await screen.findByRole('combobox', { name: 'Model' });
    await screen.findByRole('option', { name: 'Opus' });

    await userEvent.selectOptions(model, 'Opus');

    expect(updateAiSettings).toHaveBeenCalledWith({
      provider: 'claude-code',
      models: { 'claude-code': 'opus' },
      efforts: {},
      auth: {},
    });
    expect(model).toHaveValue('opus');
  });

  it('offers the efforts the chosen model accepts and drops one the next model does not', async () => {
    const { updateAiSettings } = setup({
      getAiSettings: vi.fn().mockResolvedValue({
        provider: 'codex',
        models: { codex: 'gpt-6' },
        efforts: {},
        auth: {},
      }),
      listAiModels: vi.fn().mockResolvedValue([
        { id: 'gpt-6', name: 'GPT-6', efforts: ['low', 'medium', 'high', 'xhigh'] },
        { id: 'gpt-6-mini', name: 'GPT-6 mini', efforts: ['low', 'medium'] },
      ]),
    });
    const effort = await screen.findByRole('combobox', { name: 'Reasoning effort' });
    await screen.findByRole('option', { name: 'Extra high' });

    await userEvent.selectOptions(effort, 'Extra high');
    expect(updateAiSettings).toHaveBeenLastCalledWith({
      provider: 'codex',
      models: { codex: 'gpt-6' },
      efforts: { codex: 'xhigh' },
      auth: {},
    });

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Model' }), 'GPT-6 mini');
    expect(updateAiSettings).toHaveBeenLastCalledWith({
      provider: 'codex',
      models: { codex: 'gpt-6-mini' },
      efforts: {},
      auth: {},
    });
    expect(screen.queryByRole('option', { name: 'Extra high' })).not.toBeInTheDocument();
  });

  it('keeps a supported effort when the model changes', async () => {
    const { updateAiSettings } = setup({
      getAiSettings: vi.fn().mockResolvedValue({
        provider: 'claude-code',
        models: { 'claude-code': 'opus' },
        efforts: { 'claude-code': 'high' },
        auth: {},
      }),
    });
    await screen.findByRole('option', { name: 'Sonnet' });

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Model' }), 'Sonnet');

    expect(updateAiSettings).toHaveBeenCalledWith({
      provider: 'claude-code',
      models: { 'claude-code': 'sonnet' },
      efforts: { 'claude-code': 'high' },
      auth: {},
    });
  });

  it('goes back to the default of the tool', async () => {
    const { updateAiSettings } = setup({
      getAiSettings: vi.fn().mockResolvedValue({
        provider: 'claude-code',
        models: { 'claude-code': 'opus' },
        efforts: { 'claude-code': 'max' },
        auth: {},
      }),
    });
    await screen.findByRole('option', { name: 'Opus' });

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Model' }), 'Default');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Reasoning effort' }),
      'Default',
    );

    expect(updateAiSettings).toHaveBeenLastCalledWith({
      provider: 'claude-code',
      models: {},
      efforts: {},
      auth: {},
    });
  });

  it('takes a model name that is not listed and ignores text that is not one', async () => {
    const { updateAiSettings } = setup();
    const model = await screen.findByRole('combobox', { name: 'Model' });
    await userEvent.selectOptions(model, 'Other…');
    const field = screen.getByRole('textbox', { name: 'Model name' });
    expect(field).toHaveFocus();

    await userEvent.type(field, '--dangerously-skip-permissions');
    await userEvent.tab();
    expect(updateAiSettings).not.toHaveBeenCalled();
    expect(screen.getByText(/without spaces/)).toBeInTheDocument();

    await userEvent.clear(field);
    await userEvent.type(field, 'claude-sonnet-5-5{Enter}');
    expect(updateAiSettings).toHaveBeenCalledWith({
      provider: 'claude-code',
      models: { 'claude-code': 'claude-sonnet-5-5' },
      efforts: {},
      auth: {},
    });
    expect(screen.queryByRole('textbox', { name: 'Model name' })).not.toBeInTheDocument();
    expect(model).toHaveValue('claude-sonnet-5-5');
  });

  it('says how to get a list of models when Codex is not installed', async () => {
    setup({
      getAiSettings: vi
        .fn()
        .mockResolvedValue({ provider: 'codex', models: {}, efforts: {}, auth: {} }),
      listAiModels: vi.fn().mockResolvedValue([]),
    });

    expect(
      await screen.findByText(/Check your Codex sign-in to load available models/),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveTextContent('Other…');
  });

  it('switches a tool to an API key and saves the key without showing it again', async () => {
    const saveAiApiKey = vi.fn().mockResolvedValue(undefined);
    const detectAiProviders = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'claude-code',
          installed: true,
          version: '2.1.314',
          signedIn: true,
          apiKeySaved: false,
        },
        { id: 'codex', installed: false, apiKeySaved: false },
      ])
      .mockResolvedValue([
        {
          id: 'claude-code',
          installed: true,
          version: '2.1.314',
          signedIn: true,
          apiKeySaved: true,
        },
        { id: 'codex', installed: false, apiKeySaved: false },
      ]);
    const { updateAiSettings } = setup({ saveAiApiKey, detectAiProviders });

    await userEvent.click(await screen.findByRole('radio', { name: /Use an API key/ }));
    expect(updateAiSettings).toHaveBeenCalledWith({
      provider: 'claude-code',
      models: {},
      efforts: {},
      auth: { 'claude-code': 'api-key' },
    });
    expect(await screen.findByText(/Needs an API key\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a key' })).toHaveAttribute(
      'href',
      'https://platform.claude.com/settings/keys',
    );

    const field = screen.getByLabelText('Anthropic API key');
    await userEvent.type(field, ` sk-ant-api03-${'x'.repeat(40)} `);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(saveAiApiKey).toHaveBeenCalledWith('claude-code', `sk-ant-api03-${'x'.repeat(40)}`);
    expect(await screen.findByText(/Uses your API key\./)).toBeInTheDocument();
    expect(field).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('does not save text that is not an API key', async () => {
    const saveAiApiKey = vi.fn();
    setup({
      getAiSettings: vi.fn().mockResolvedValue({
        provider: 'codex',
        models: {},
        efforts: {},
        auth: { codex: 'api-key' },
      }),
      saveAiApiKey,
    });

    await userEvent.type(await screen.findByLabelText('OpenAI API key'), 'my key');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.keyboard('{Enter}');
    expect(saveAiApiKey).not.toHaveBeenCalled();
  });

  it('removes a saved key', async () => {
    const removeAiApiKey = vi.fn().mockResolvedValue(undefined);
    setup({
      getAiSettings: vi.fn().mockResolvedValue({
        provider: 'codex',
        models: {},
        efforts: {},
        auth: { codex: 'api-key' },
      }),
      detectAiProviders: vi.fn().mockResolvedValue([
        { id: 'claude-code', installed: true, apiKeySaved: false },
        { id: 'codex', installed: true, version: 'codex-cli 0.166.0', apiKeySaved: true },
      ]),
      removeAiApiKey,
    });

    expect(
      await screen.findByText(/codex-cli 0\.166\.0\. Uses your API key\./),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(removeAiApiKey).toHaveBeenCalledWith('codex');
  });
});
