import { useQuery } from "@tanstack/react-query";

import { fetchMyInvites } from "./invitesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useAuth } from "@/services/auth/useAuth";

// gated on the session — the RPC reads auth.uid(), so asking before sign-in resolves just caches an empty answer
export function useMyInvites() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.myInvites(),
    queryFn: fetchMyInvites,
    enabled: Boolean(user),
  });
}
