import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateProfile } from "./profileApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { ISupabaseProfile } from "@/types/data";

export default function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateProfile,

    // The key comes from the profile being saved rather than from useAuth, so
    // it cannot disagree with the entry useProfile(user?.id) reads.
    onMutate: async (profile) => {
      const key = queryKeys.profile(profile.id);

      await queryClient.cancelQueries({ queryKey: key });

      const previous = queryClient.getQueryData<ISupabaseProfile>(key);

      queryClient.setQueryData<ISupabaseProfile>(key, profile);

      return { key, previous };
    },

    onError: (_err, _profile, context) => {
      if (!context) return;

      if (context.previous) {
        queryClient.setQueryData(context.key, context.previous);
        return;
      }

      // Nothing to restore: setQueryData(key, undefined) is a no-op, so the
      // optimistic row would survive the failure. Drop the entry instead.
      queryClient.removeQueries({ queryKey: context.key, exact: true });
    },

    // The saved row, not the optimistic copy — column defaults and triggers
    // decide what was actually stored.
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.profile(saved.id), saved);
    },
  });
}
