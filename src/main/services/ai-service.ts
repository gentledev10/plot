import {
  AI_PROVIDER_IDS,
  type AiModelOption,
  type AiProviderId,
  type AiProviderStatus,
  selectAvailableProvider,
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
  let checking: Promise<AiProviderStatus[]> | undefined;
  function detectAll() {
    checking ??= Promise.all(
      AI_PROVIDER_IDS.map(async (id) => ({
        ...(await detect(id)),
        apiKeySaved: await keys.has(id),
      })),
    ).finally(() => {
      checking = undefined;
    });
    return checking;
  }
  async function currentSettings() {
    const settings = await store.read();
    return settings.autoSelect ? selectAvailableProvider(settings, await detectAll()) : settings;
  }
  return {
    getAiSettings: currentSettings,

    async updateAiSettings(settings) {
      await store.write(settings);
      return currentSettings();
    },

    detectAiProviders: detectAll,

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
