import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { AppProviders, createQueryClient } from './app/providers';
import { createApi } from './lib/api';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles/tokens.css';
import './styles/base.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element');
}

createRoot(root).render(
  <StrictMode>
    <AppProviders api={createApi(window.viewer)} queryClient={createQueryClient()}>
      <App platform={window.viewer.platform} />
    </AppProviders>
  </StrictMode>,
);
