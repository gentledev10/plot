import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithApi } from '../../../test/render';
import { useLanguage } from './LanguageProvider';
import { LanguageSettings } from './LanguageSettings';

function ReviewLanguage() {
  return <output aria-label="resolved review language">{useLanguage().reviewLanguage}</output>;
}

describe('LanguageSettings', () => {
  it('changes the app immediately, follows it for reviews and permits an independent review language', async () => {
    const setPreference = vi.fn().mockResolvedValue(undefined);
    renderWithApi(
      <>
        <LanguageSettings />
        <ReviewLanguage />
      </>,
      { setPreference },
    );
    await userEvent.selectOptions(screen.getByLabelText('App language'), 'ko');
    expect(await screen.findByLabelText('앱 표시 언어')).toHaveValue('ko');
    expect(screen.getByLabelText('resolved review language')).toHaveTextContent('ko');
    await userEvent.selectOptions(screen.getByLabelText('AI 리뷰 언어'), 'en');
    expect(screen.getByLabelText('앱 표시 언어')).toHaveValue('ko');
    expect(screen.getByLabelText('resolved review language')).toHaveTextContent('en');
    expect(setPreference).toHaveBeenLastCalledWith('languages', { app: 'ko', review: 'en' });
  });
  it('keeps the previous language when saving fails', async () => {
    renderWithApi(<LanguageSettings />, {
      setPreference: vi.fn().mockRejectedValue(new Error('Disk full')),
    });
    await userEvent.selectOptions(screen.getByLabelText('App language'), 'ko');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
    expect(screen.getByLabelText('App language')).toHaveValue('system');
  });
});
