import { useQuery } from "@tanstack/react-query";

import { previewInvite } from "./invitesApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: queryKeys.invitePreview(token),
    queryFn: () => previewInvite({ token }),
  });
}
