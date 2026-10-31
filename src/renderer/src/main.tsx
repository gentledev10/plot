import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { AppProviders, createQueryClient } from './app/providers';
import { applySavedAppearance } from './features/appearance/AppearanceProvider';
import { createApi } from './lib/api';
import { initializePreferences } from './lib/preferences';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles/tokens.css';
import './styles/base.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element');
}

const api = createApi(window.viewer);
initializePreferences(
  await api.getPreferences().catch(() => ({})),
  (key, value) => void api.setPreference(key, value).catch(() => {}),
);
applySavedAppearance();

createRoot(root).render(
  <StrictMode>
    <AppProviders
      api={api}
      queryClient={createQueryClient()}
      platform={window.viewer.platform}
      subscribeToMenu={window.viewer.onMenuCommand}
    >
      <App />
    </AppProviders>
  </StrictMode>,
);
