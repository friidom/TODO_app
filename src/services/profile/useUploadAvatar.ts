import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/services/queryClient/queryKeys";
import type { Profile } from "./profileApi";
import { removeAvatar, uploadAvatar } from "./uploadAvatars";

// setQueryData rather than invalidateQueries, matching useUpdateProfile next
// door: the server already returned the saved profile, so a refetch would only
// ask for what is in hand — and it would re-seed ProfilePage's form, throwing
// away any unsaved name or bio the person had typed. The sidebar renders the
// avatar from this same key, so writing it updates both surfaces at once.
function useAvatarMutation<TArgs>(mutationFn: (args: TArgs) => Promise<Profile>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,

    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.profile(saved.id), saved);
    },
  });
}

export function useUploadAvatar() {
  return useAvatarMutation(({ file }: { file: File }) => uploadAvatar(file));
}

// No UI calls this: ProfilePage has no remove control and none was added. It
// exists because clearing the field is otherwise unreachable now that a
// general profile PATCH no longer accepts avatar_url.
export function useRemoveAvatar() {
  return useAvatarMutation(() => removeAvatar());
}
