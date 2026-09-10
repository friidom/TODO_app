import { useMutation } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";

import { signUp } from "./authApi";
import { safeNext } from "@/utils/nextPath";

export function useRegister() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const next = safeNext(searchParams.get("next")) ?? "/";

  return useMutation({
    // RegisterForm already renders the error next to the fields
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
      // no session yet if confirmation is required — RegisterForm shows the "check your email" state instead
      if (needsConfirmation) return;

      navigate(next);
    },
  });
}
