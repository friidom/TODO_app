import { useMutation } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";

import { signIn } from "./authApi";
import { safeNext } from "@/utils/nextPath";

export function useLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Where the user was headed before they were asked to sign in. Screened
  // through safeNext because it comes from the query string — see the
  // open-redirect note there. `/` when there is nothing to return to.
  const next = safeNext(searchParams.get("next")) ?? "/";

  return useMutation({
    // LoginForm renders login.error next to the fields, so the global
    // MutationCache toast would say the same thing a second time.
    meta: { silent: true },

    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signIn(email, password),

    onSuccess: () => {
      navigate(next);
    },
  });
}
