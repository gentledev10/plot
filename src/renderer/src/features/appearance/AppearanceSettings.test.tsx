import type { AddedFont } from '@shared/fonts';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { readPreference, writePreference } from '../../lib/preferences';
import { AppearanceSettings } from './AppearanceSettings';

const stored = () =>
  readPreference<{ colors?: object; codeFont?: { family?: string } } | undefined>(
    'appearance',
    undefined,
  );
const variable = (name: string) => document.documentElement.style.getPropertyValue(name);

const hack = (weight: number): AddedFont => ({
  id: weight === 400 ? '0123456789abcdef' : 'fedcba9876543210',
  family: 'Hack',
  weight,
  style: 'normal',
});

describe('AppearanceSettings', () => {
  it('switches the theme and tells the main process whether it is light or dark', async () => {
    const { api } = renderWithApi(<AppearanceSettings />);
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: 'Darcula' }));

    expect(variable('--color-bg-editor')).toBe('#2b2b2b');
    expect(document.documentElement.dataset.theme).toBe('darcula');
    expect(api.setThemeSource).toHaveBeenLastCalledWith('dark');
    expect(stored()).toMatchObject({ theme: 'darcula' });
  });

  it('lets each theme keep its own colors', async () => {
    renderWithApi(<AppearanceSettings />);
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    fireEvent.input(screen.getByLabelText('Inserted lines'), { target: { value: '#123456' } });

    expect(variable('--diff-inserted-line')).toBe('#123456');
    expect(stored()?.colors).toEqual({ dark: { 'diff-inserted-line': '#123456' } });

    await userEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(variable('--diff-inserted-line')).toBe('#e3f2df');

    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reset Inserted lines' }));
    expect(variable('--diff-inserted-line')).toBe('#294436');
  });

  it('changes the code font and size', async () => {
    renderWithApi(<AppearanceSettings />, {
      listInstalledFonts: vi.fn().mockResolvedValue([{ family: 'D2Coding', monospaced: true }]),
    });
    const family = screen.getByRole('combobox', { name: 'Font' });

    await userEvent.selectOptions(family, await screen.findByRole('option', { name: 'D2Coding' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Size' }), {
      target: { value: '40' },
    });

    expect(stored()?.codeFont).toEqual({ family: 'D2Coding', size: 24 });
    expect(variable('--font-code')).toContain('"D2Coding"');
  });

  it('offers the fonts that come with Plot, the ones added to it, and those on this Mac', async () => {
    renderWithApi(<AppearanceSettings />, {
      listInstalledFonts: vi.fn().mockResolvedValue([
        { family: 'Helvetica', monospaced: false },
        { family: 'JetBrains Mono', monospaced: true },
        { family: 'Menlo', monospaced: true },
      ]),
      listAddedFonts: vi.fn().mockResolvedValue([hack(400), hack(700)]),
    });
    const groups = () =>
      Object.fromEntries(
        screen
          .getAllByRole('group')
          .filter((group) => group.tagName === 'OPTGROUP')
          .map((group) => [
            group.getAttribute('label'),
            within(group)
              .getAllByRole('option')
              .map((option) => option.textContent),
          ]),
      );
    await screen.findByRole('option', { name: 'Menlo' });

    expect(groups()).toEqual({
      'Included with Plot': [
        'JetBrains Mono',
        'Fira Code',
        'Geist Mono',
        'Inconsolata',
        'Iosevka',
        'Roboto Mono',
      ],
      'Added to Plot': ['Hack'],
      'Installed on this Mac': ['Menlo'],
    });

    const filter = screen.getByRole('checkbox', { name: 'Only fixed-width system fonts' });
    expect(filter).toHaveAccessibleDescription(/keeping code columns aligned/);
    await userEvent.click(filter);
    expect(groups()['Installed on this Mac']).toEqual(['Helvetica', 'Menlo']);
  });

  it('adds font files and switches code to the first of them', async () => {
    const listAddedFonts = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([hack(400)]);
    const readAddedFont = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    renderWithApi(<AppearanceSettings />, {
      addFonts: vi.fn().mockResolvedValue([hack(400)]),
      listAddedFonts,
      readAddedFont,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Add font files…' }));

    expect(await screen.findByRole('option', { name: 'Hack' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Font' })).toHaveValue('Hack');
    expect(stored()?.codeFont?.family).toBe('Hack');
    await vi.waitFor(() =>
      expect([...document.fonts].map((face) => face.family)).toEqual(['Hack']),
    );
    expect(readAddedFont).toHaveBeenCalledWith(hack(400).id);
  });

  it('says why font files could not be added', async () => {
    const { PlotError } = await import('../../lib/api');
    renderWithApi(<AppearanceSettings />, {
      addFonts: vi
        .fn()
        .mockRejectedValue(
          new PlotError('invalid-argument', 'notes.ttf is not a TrueType or OpenType font.'),
        ),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Add font files…' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('notes.ttf is not a TrueType');
    expect(stored()?.codeFont?.family ?? 'JetBrains Mono').toBe('JetBrains Mono');
  });

  it('removes an added font and goes back to the font that comes with Plot', async () => {
    writePreference('appearance', { theme: 'system', codeFont: { family: 'Hack', size: 13 } });
    const removeAddedFont = vi.fn().mockResolvedValue(undefined);
    renderWithApi(<AppearanceSettings />, {
      listAddedFonts: vi
        .fn()
        .mockResolvedValueOnce([hack(400)])
        .mockResolvedValue([]),
      readAddedFont: vi.fn().mockResolvedValue(new Uint8Array()),
      removeAddedFont,
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Remove from Plot' }));

    expect(removeAddedFont).toHaveBeenCalledWith('Hack');
    await vi.waitFor(() => expect(stored()?.codeFont?.family).toBe('JetBrains Mono'));
    expect(screen.queryByRole('option', { name: 'Hack' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove from Plot' })).not.toBeInTheDocument();
  });

  it('says when the chosen font is not on this Mac', async () => {
    writePreference('appearance', {
      theme: 'system',
      codeFont: { family: 'Operator Mono', size: 13 },
    });
    renderWithApi(<AppearanceSettings />);

    const option = await screen.findByRole('option', { name: 'Operator Mono (not installed)' });
    expect(option).toHaveProperty('selected', true);
    expect(
      screen.getByText(
        'Operator Mono is not installed on this Mac, so code is shown in JetBrains Mono.',
      ),
    ).toBeInTheDocument();
  });

  it('shows where a color is used, and the code font, in a preview of the app', async () => {
    renderWithApi(<AppearanceSettings />);
    const preview = screen.getByRole('figure', { name: 'Preview' });
    const active = () =>
      [...preview.querySelectorAll('[data-active="true"]')].map(
        (element) => element.getAttribute('data-kind') ?? element.textContent,
      );
    expect(active()).toEqual([]);

    await userEvent.hover(screen.getByLabelText('Inserted lines'));
    expect(active()).toEqual(['inserted']);
    await userEvent.hover(screen.getByLabelText('Accent'));
    expect(active()).toEqual(['Pull request #412']);
    await userEvent.unhover(screen.getByLabelText('Accent'));
    expect(active()).toEqual([]);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Size' }), {
      target: { value: '18' },
    });
    expect(preview.querySelector('[style*="font-size: 18px"]')).toHaveTextContent('tries');
  });
});
