import { AI_PROVIDER_IDS, type AiProviderId, type AiProviderStatus } from '@shared/ai';
import type { PlotApi } from '@shared/ipc';
import type { AiSettingsStore } from '../ai/ai-settings-store';
import type { ApiKeyStore } from '../ai/api-key-store';

export type AiService = Pick<
  PlotApi,
  'getAiSettings' | 'updateAiSettings' | 'detectAiProviders' | 'saveAiApiKey' | 'removeAiApiKey'
>;

interface AiServiceOptions {
  store: AiSettingsStore;
  keys: Pick<ApiKeyStore, 'has' | 'save' | 'remove'>;
  detect(id: AiProviderId): Promise<Omit<AiProviderStatus, 'apiKeySaved'>>;
}

export function createAiService({ store, keys, detect }: AiServiceOptions): AiService {
  return {
    getAiSettings() {
      return store.read();
    },

    async updateAiSettings(settings) {
      await store.write(settings);
      return settings;
    },

    detectAiProviders() {
      return Promise.all(
        AI_PROVIDER_IDS.map(async (id) => ({
          ...(await detect(id)),
          apiKeySaved: await keys.has(id),
        })),
      );
    },

    saveAiApiKey(provider, key) {
      return keys.save(provider, key);
    },

    removeAiApiKey(provider) {
      return keys.remove(provider);
    },
  };
}
