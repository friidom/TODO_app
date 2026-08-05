import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateProfile } from "../../api/profile/profileApi";
import { queryKeys } from "@/services/queryClient/queryKeys";

export default function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateProfile,
    onSuccess: (profile) => {
      // The bare prefix, which useProfile does not read — it reads
      // profile(userId). Preserved as-is so this stays a pure key refactor;
      // M1-04 is the task that repoints it.
      queryClient.setQueryData(queryKeys.profiles(), profile);
    },
  });
}
