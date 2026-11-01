import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../../app/providers';

export const fontKeys = {
  installed: ['fonts', 'installed'] as const,
  added: ['fonts', 'added'] as const,
};

export function useInstalledFonts() {
  const api = useApi();
  return useQuery({ queryKey: fontKeys.installed, queryFn: () => api.listInstalledFonts() });
}

export function useAddedFonts() {
  const api = useApi();
  return useQuery({
    queryKey: fontKeys.added,
    queryFn: () => api.listAddedFonts(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useAddFonts() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.addFonts(),
    onSuccess: () => client.invalidateQueries({ queryKey: fontKeys.added }),
  });
}

export function useRemoveAddedFont() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (family: string) => api.removeAddedFont(family),
    onSuccess: () => client.invalidateQueries({ queryKey: fontKeys.added }),
  });
}
