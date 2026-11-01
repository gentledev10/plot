import {
  AI_PROVIDER_IDS,
  type AiModelOption,
  type AiProviderId,
  type AiProviderStatus,
} from '@shared/ai';
import type { PlotApi } from '@shared/ipc';
import type { AiSettingsStore } from '../ai/ai-settings-store';
import type { ApiKeyStore } from '../ai/api-key-store';

export type AiService = Pick<
  PlotApi,
  | 'getAiSettings'
  | 'updateAiSettings'
  | 'detectAiProviders'
  | 'listAiModels'
  | 'saveAiApiKey'
  | 'removeAiApiKey'
>;

interface AiServiceOptions {
  store: AiSettingsStore;
  keys: Pick<ApiKeyStore, 'has' | 'save' | 'remove'>;
  detect(id: AiProviderId): Promise<Omit<AiProviderStatus, 'apiKeySaved'>>;
  listModels(id: AiProviderId): Promise<AiModelOption[]>;
}

export function createAiService({ store, keys, detect, listModels }: AiServiceOptions): AiService {
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

    listAiModels(provider) {
      return listModels(provider);
    },

    saveAiApiKey(provider, key) {
      return keys.save(provider, key);
    },

    removeAiApiKey(provider) {
      return keys.remove(provider);
    },
  };
}
