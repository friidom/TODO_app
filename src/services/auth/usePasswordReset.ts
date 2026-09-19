import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";

import { requestPasswordReset, updatePassword } from "./authApi";

export function useRequestPasswordReset() {
  return useMutation({
    meta: { silent: true },
    mutationFn: (email: string) => requestPasswordReset(email),
  });
}

// No sign-out afterwards: the API deliberately issues no session from a reset,
// so a leaked link never becomes a live account.
export function useUpdatePassword() {
  const navigate = useNavigate();

  return useMutation({
    meta: { silent: true },
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      updatePassword(token, password),
    onSuccess: () => navigate("/login?reset=1", { replace: true }),
  });
}
