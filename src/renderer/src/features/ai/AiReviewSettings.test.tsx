import type { AiSettings } from '@shared/ai';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { AiReviewSettings } from './AiReviewSettings';

function setup(overrides: Parameters<typeof renderWithApi>[1] = {}) {
  const updateAiSettings = vi.fn(async (settings: AiSettings) => settings);
  const rendered = renderWithApi(<AiReviewSettings />, {
    getAiSettings: vi.fn().mockResolvedValue({ provider: 'claude-code', models: {} }),
    detectAiProviders: vi.fn().mockResolvedValue([
      { id: 'claude-code', installed: true, version: '2.1.314 (Claude Code)', signedIn: true },
      { id: 'codex', installed: false },
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
    const codex = await screen.findByRole('radio', { name: /Codex CLI/ });
    await userEvent.click(codex);
    expect(codex).toBeChecked();
    expect(updateAiSettings).toHaveBeenCalledWith({ provider: 'codex', models: {} });
  });

  it('puts the previous choice back when saving fails', async () => {
    setup({ updateAiSettings: vi.fn().mockRejectedValue(new Error('Disk full.')) });
    const codex = await screen.findByRole('radio', { name: /Codex CLI/ });
    await userEvent.click(codex);

    expect(await screen.findByRole('alert')).toHaveTextContent('Disk full.');
    expect(codex).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /Claude Code/ })).toBeChecked();
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
    });
  });
});
