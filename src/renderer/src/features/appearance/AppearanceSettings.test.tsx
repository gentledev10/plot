import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { readPreference } from '../../lib/preferences';
import { AppearanceSettings } from './AppearanceSettings';

const stored = () =>
  readPreference<{ colors?: object; codeFont?: { family?: string } } | undefined>(
    'appearance',
    undefined,
  );
const variable = (name: string) => document.documentElement.style.getPropertyValue(name);

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
    renderWithApi(<AppearanceSettings />);
    const family = screen.getByRole('combobox', { name: 'Font' });

    await userEvent.clear(family);
    await userEvent.type(family, 'D2Coding{Enter}');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Size' }), {
      target: { value: '40' },
    });

    expect(stored()?.codeFont).toEqual({ family: 'D2Coding', size: 24 });
    expect(variable('--font-code')).toContain('"D2Coding"');
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

  it('refuses font names that could break out of the style', async () => {
    renderWithApi(<AppearanceSettings />);
    const family = screen.getByRole('combobox', { name: 'Font' });

    await userEvent.clear(family);
    await userEvent.type(family, 'Mono"; color: red{Enter}');

    expect(screen.getByRole('alert')).toHaveTextContent('Use a font name made of letters');
    expect(stored()?.codeFont?.family ?? 'JetBrains Mono').toBe('JetBrains Mono');
  });
});
