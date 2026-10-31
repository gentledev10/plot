import { AI_PROVIDER_IDS, type AiProviderId, type AiProviderStatus } from '@shared/ai';
import type { ViewerApi } from '@shared/ipc';
import type { AiSettingsStore } from '../ai/ai-settings-store';

export type AiService = Pick<ViewerApi, 'getAiSettings' | 'updateAiSettings' | 'detectAiProviders'>;

interface AiServiceOptions {
  store: AiSettingsStore;
  detect(id: AiProviderId): Promise<AiProviderStatus>;
}

export function createAiService({ store, detect }: AiServiceOptions): AiService {
  return {
    getAiSettings() {
      return store.read();
    },

    async updateAiSettings(settings) {
      await store.write(settings);
      return settings;
    },

    detectAiProviders() {
      return Promise.all(AI_PROVIDER_IDS.map((id) => detect(id)));
    },
  };
}
