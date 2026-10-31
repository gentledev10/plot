import type { AiSettings } from '@shared/ai';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../app/providers';

export const aiKeys = {
  settings: ['ai', 'settings'] as const,
  providers: ['ai', 'providers'] as const,
};

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
    onSuccess: (settings) => client.setQueryData(aiKeys.settings, settings),
  });
}
