import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { requestPasswordReset, signOut, updatePassword } from "./authApi";

export function useRequestPasswordReset() {
  return useMutation({
    meta: { silent: true },
    mutationFn: (email: string) => requestPasswordReset(email),
  });
}

// signs out after setting the password — a recovery link mints a real session, and leaving it live turns a leaked email into account takeover
export function useUpdatePassword() {
  const navigate = useNavigate();

  return useMutation({
    meta: { silent: true },
    mutationFn: async (password: string) => {
      await updatePassword(password);
      await signOut();
    },
    onSuccess: () => navigate("/login?reset=1", { replace: true }),
  });
}
