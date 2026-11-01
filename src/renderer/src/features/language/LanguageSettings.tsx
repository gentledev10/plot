import { LANGUAGES } from '@shared/language';
import { useId, useState } from 'react';
import { Select } from '../../components/Select';
import { useLanguage } from './LanguageProvider';
import styles from './LanguageSettings.module.css';

export function LanguageSettings() {
  const { settings, change, t } = useLanguage();
  const appId = useId();
  const reviewId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function update(next: typeof settings) {
    setPending(true);
    setError('');
    try {
      await change(next);
    } catch {
      setError(t('Could not save the language settings. Try again.'));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className={styles.settings}>
      <label htmlFor={appId}>{t('App language')}</label>
      <Select
        id={appId}
        value={settings.app}
        disabled={pending}
        onChange={(event) =>
          void update({ ...settings, app: event.target.value as typeof settings.app })
        }
      >
        <option value="system">{t('Follow system')}</option>
        {LANGUAGES.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </Select>
      <label htmlFor={reviewId}>{t('AI review language')}</label>
      <Select
        id={reviewId}
        value={settings.review}
        disabled={pending}
        onChange={(event) =>
          void update({ ...settings, review: event.target.value as typeof settings.review })
        }
      >
        <option value="app">{t('Follow app language')}</option>
        {LANGUAGES.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </Select>
      <p>
        {t(
          'Use one language for the app and another for AI explanations, or let reviews follow the app. Code and file names stay unchanged.',
        )}
      </p>
      <p>
        {t(
          'Saved reviews are kept separately for each language. Changing the language does not make a paid AI request; generate an overview when you are ready.',
        )}
      </p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
