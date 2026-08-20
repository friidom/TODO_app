import { useMutation } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";

import { signUp } from "./authApi";
import { safeNext } from "@/utils/nextPath";

export function useRegister() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Same as useLogin: an invite link that sends a stranger here has to survive
  // them creating an account, which is the common case for an invitation —
  // the person being invited usually does not have one yet.
  const next = safeNext(searchParams.get("next")) ?? "/";

  return useMutation({
    // RegisterForm renders register.error next to the fields, so the global
    // MutationCache toast would say the same thing a second time.
    meta: { silent: true },

    mutationFn: ({
      email,
      password,
      username,
    }: {
      email: string;
      password: string;
      username: string;
    }) => signUp(email, password, username),

    onSuccess: ({ needsConfirmation }) => {
      // With email confirmation required there is no session yet, so there is
      // nowhere to navigate to — ProtectedRoute would bounce straight back.
      // RegisterForm renders the "check your email" state off this same flag.
      if (needsConfirmation) return;

      navigate(next);
    },
  });
}
