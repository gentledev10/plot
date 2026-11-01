import type { AiProviderId, AiSettings } from '@shared/ai';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../app/providers';

export const aiKeys = {
  settings: ['ai', 'settings'] as const,
  providers: ['ai', 'providers'] as const,
  models: (provider: AiProviderId) => ['ai', 'models', provider] as const,
};

export function useAiModels(provider: AiProviderId) {
  const api = useApi();
  return useQuery({
    queryKey: aiKeys.models(provider),
    queryFn: () => api.listAiModels(provider),
    staleTime: 5 * 60_000,
  });
}

export function useAiSettings() {
  const api = useApi();
  return useQuery({ queryKey: aiKeys.settings, queryFn: () => api.getAiSettings() });
}

export function useAiProviders() {
  const api = useApi();
  return useQuery({
    queryKey: aiKeys.providers,
    queryFn: () => api.detectAiProviders(),
    staleTime: 0,
  });
}

export function useUpdateAiSettings() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (settings: AiSettings) => api.updateAiSettings(settings),
    onMutate: (settings) => {
      const previous = client.getQueryData<AiSettings>(aiKeys.settings);
      client.setQueryData(aiKeys.settings, settings);
      return { previous };
    },
    onError: (_error, _settings, context) => {
      client.setQueryData(aiKeys.settings, context?.previous);
    },
    onSuccess: (settings, _input, context) => {
      client.setQueryData(aiKeys.settings, settings);
      if (JSON.stringify(settings.auth) !== JSON.stringify(context?.previous?.auth)) {
        void client.invalidateQueries({ queryKey: ['ai', 'models'] });
      }
    },
  });
}

export function useSaveAiApiKey() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, key }: { provider: AiProviderId; key: string }) =>
      api.saveAiApiKey(provider, key),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: aiKeys.providers });
      return client.invalidateQueries({ queryKey: ['ai', 'models'] });
    },
  });
}

export function useRemoveAiApiKey() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (provider: AiProviderId) => api.removeAiApiKey(provider),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: aiKeys.providers });
      return client.invalidateQueries({ queryKey: ['ai', 'models'] });
    },
  });
}
