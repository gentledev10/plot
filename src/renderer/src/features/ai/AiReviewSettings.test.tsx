import type { AiSettings } from '@shared/ai';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { AiReviewSettings } from './AiReviewSettings';

function setup(overrides: Parameters<typeof renderWithApi>[1] = {}) {
  const updateAiSettings = vi.fn(async (settings: AiSettings) => settings);
  const rendered = renderWithApi(<AiReviewSettings />, {
    getAiSettings: vi.fn().mockResolvedValue({ provider: 'claude-code', models: {}, auth: {} }),
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
    expect(updateAiSettings).toHaveBeenCalledWith({ provider: 'codex', models: {}, auth: {} });
  });

  it('puts the previous choice back when saving fails', async () => {
    setup({ updateAiSettings: vi.fn().mockRejectedValue(new Error('Disk full.')) });
    const codex = await screen.findByRole('radio', { name: /^Codex CLI/ });
    await userEvent.click(codex);

    expect(await screen.findByRole('alert')).toHaveTextContent('Disk full.');
    expect(codex).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /^Claude Code/ })).toBeChecked();
  });

  it('saves a model for the selected tool and ignores names that are not models', async () => {
    const { updateAiSettings } = setup();
    const field = await screen.findByLabelText('Model for Claude Code');

    await userEvent.type(field, '--dangerously-skip-permissions');
    await userEvent.tab();
    expect(updateAiSettings).not.toHaveBeenCalled();
    expect(screen.getByText(/without spaces/)).toBeInTheDocument();

    await userEvent.clear(field);
    await userEvent.type(field, 'claude-sonnet-5-5{Enter}');
    expect(updateAiSettings).toHaveBeenCalledWith({
      provider: 'claude-code',
      models: { 'claude-code': 'claude-sonnet-5-5' },
      auth: {},
    });
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
      getAiSettings: vi
        .fn()
        .mockResolvedValue({ provider: 'codex', models: {}, auth: { codex: 'api-key' } }),
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
      getAiSettings: vi
        .fn()
        .mockResolvedValue({ provider: 'codex', models: {}, auth: { codex: 'api-key' } }),
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
