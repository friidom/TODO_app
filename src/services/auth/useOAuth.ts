import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "../queryClient/queryKeys";
import {
  confirmLink,
  fetchConnections,
  fetchProviders,
  startLink,
  unlinkConnection,
  type OAuthProvider,
} from "./oauthApi";

// A provider the server has no credentials for is absent from this list, so a
// button is never rendered that would dead-end.
export function useOAuthProviders() {
  return useQuery({
    queryKey: queryKeys.oauthProviders(),
    queryFn: fetchProviders,
    // Server configuration, not user data: it cannot change during a session.
    staleTime: Infinity,
  });
}

export function useOAuthConnections() {
  return useQuery({
    queryKey: queryKeys.oauthConnections(),
    queryFn: fetchConnections,
  });
}

// No onSuccess navigation: startLink leaves the page for the provider, so this
// mutation only ever settles by rejecting.
export function useLinkProvider() {
  return useMutation({
    mutationFn: (provider: OAuthProvider) => startLink(provider),
  });
}

export function useUnlinkProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    // ConnectedAccounts renders the refusal beside its row: the "only way into
    // your account" message is guidance, not a failure toast.
    meta: { silent: true },

    mutationFn: (id: string) => unlinkConnection(id),

    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.oauthConnections() }),
  });
}

export function useConfirmLink() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { silent: true },

    mutationFn: (token: string) => confirmLink(token),

    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.oauthConnections() }),
  });
}
