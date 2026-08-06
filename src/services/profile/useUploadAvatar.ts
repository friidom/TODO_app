import { useMutation } from "@tanstack/react-query";
import { uploadAvatar } from "./uploadAvatars";

export function useUploadAvatar() {
  return useMutation({
    mutationFn: ({ file, userId }: { file: File; userId: string }) =>
      uploadAvatar(file, userId),
  });
}
