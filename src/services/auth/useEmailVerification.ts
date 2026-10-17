import { useMutation } from "@tanstack/react-query";

import { resendVerification, verifyEmail } from "./authApi";

export function useVerifyEmail() {
  return useMutation({
    meta: { silent: true },
    mutationFn: (token: string) => verifyEmail(token),
  });
}

export function useResendVerification() {
  return useMutation({
    meta: { silent: true },
    mutationFn: (email: string) => resendVerification(email.trim()),
  });
}
