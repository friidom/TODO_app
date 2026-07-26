import { useMutation } from "@tanstack/react-query";
import { signOut } from "../../api/authApi";
import { queryClient } from "../../queryClient/queryClient";

export function useLogout() {
  return useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      queryClient.clear();
    }
  });
}