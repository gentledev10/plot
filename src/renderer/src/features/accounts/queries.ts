import type { Account, BrowserSignIn, TokenSignIn } from '@shared/accounts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '../../app/providers';
import { PlotError } from '../../lib/api';

export const accountKeys = {
  list: ['accounts'] as const,
};

export function useAccounts() {
  const api = useApi();
  return useQuery({ queryKey: accountKeys.list, queryFn: () => api.listAccounts() });
}

export function useCurrentAccount(): Account | undefined {
  const { data } = useAccounts();
  return data?.accounts.find((account) => account.id === data.currentId);
}

// Everything cached was loaded with some account's token, so a change of account reloads it all.
function useRefreshAfterAccountChange() {
  const client = useQueryClient();
  return useCallback(() => client.invalidateQueries(), [client]);
}

export function useAccountActions() {
  const api = useApi();
  const refresh = useRefreshAfterAccountChange();
  return {
    switchAccount: useMutation({
      mutationFn: (id: string) => api.switchAccount(id),
      onSuccess: refresh,
    }),
    removeAccount: useMutation({
      mutationFn: (id: string) => api.removeAccount(id),
      onSuccess: refresh,
    }),
    signInWithToken: useMutation({
      mutationFn: (input: TokenSignIn) => api.signInWithToken(input),
      onSuccess: refresh,
    }),
    signInWithGitHubCli: useMutation({
      mutationFn: (host: string) => api.signInWithGitHubCli(host),
      onSuccess: refresh,
    }),
  };
}

export type BrowserSignInState =
  | { step: 'idle' }
  | { step: 'starting' }
  | { step: 'waiting'; signIn: BrowserSignIn }
  | { step: 'failed'; message: string };

export function useBrowserSignIn(onSignedIn?: (account: Account) => void) {
  const api = useApi();
  const refresh = useRefreshAfterAccountChange();
  const [state, setState] = useState<BrowserSignInState>({ step: 'idle' });
  const active = useRef<string | undefined>(undefined);
  const latestOnSignedIn = useRef(onSignedIn);
  latestOnSignedIn.current = onSignedIn;

  useEffect(
    () => () => {
      if (active.current) {
        void api.cancelBrowserSignIn(active.current);
      }
    },
    [api],
  );

  async function start() {
    setState({ step: 'starting' });
    let id: string | undefined;
    try {
      const signIn = await api.startBrowserSignIn();
      id = signIn.id;
      active.current = id;
      setState({ step: 'waiting', signIn });
      const account = await api.finishBrowserSignIn(id);
      if (active.current !== id) {
        return;
      }
      active.current = undefined;
      setState({ step: 'idle' });
      await refresh();
      latestOnSignedIn.current?.(account);
    } catch (error) {
      if (id !== undefined && active.current !== id) {
        return;
      }
      active.current = undefined;
      if (error instanceof PlotError && error.code === 'sign-in-cancelled') {
        setState({ step: 'idle' });
        return;
      }
      setState({ step: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  }

  function cancel() {
    const id = active.current;
    active.current = undefined;
    setState({ step: 'idle' });
    if (id) {
      void api.cancelBrowserSignIn(id);
    }
  }

  return { state, start, cancel };
}
