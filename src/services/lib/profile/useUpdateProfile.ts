import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateProfile } from "../../api/profile/profileApi";

export default function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateProfile,
    onSuccess: (profile) => {
      queryClient.setQueryData(["profile"], profile);
    },
  });
}
