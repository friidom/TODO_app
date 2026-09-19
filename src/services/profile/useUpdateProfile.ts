import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateProfile } from "./profileApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Profile } from "./profileApi";

export default function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateProfile,

    onMutate: async (profile) => {
      const key = queryKeys.profile(profile.id);

      await queryClient.cancelQueries({ queryKey: key });

      const previous = queryClient.getQueryData<Profile>(key);

      queryClient.setQueryData<Profile>(key, profile);

      return { key, previous };
    },

    onError: (_err, _profile, context) => {
      if (!context) return;

      if (context.previous) {
        queryClient.setQueryData(context.key, context.previous);
        return;
      }

      // setQueryData(key, undefined) is a no-op, so drop the entry instead of trying to restore nothing
      queryClient.removeQueries({ queryKey: context.key, exact: true });
    },

    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.profile(saved.id), saved);
    },
  });
}
