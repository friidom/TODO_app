import { useMutation } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";

import { signIn } from "./authApi";
import { safeNext } from "@/utils/nextPath";

export function useLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // screened through safeNext since this comes from the query string — see nextPath.ts for the open-redirect note
  const next = safeNext(searchParams.get("next")) ?? "/";

  return useMutation({
    // LoginForm renders login.error next to the fields already
    meta: { silent: true },

    mutationFn: ({
      identifier,
      password,
    }: {
      identifier: string;
      password: string;
    }) => signIn(identifier, password),

    onSuccess: () => {
      navigate(next);
    },
  });
}
