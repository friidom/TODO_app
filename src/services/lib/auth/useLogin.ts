import { useMutation } from "@tanstack/react-query";
import { signIn } from "../../api/authApi";
import { useNavigate } from "react-router";
export function useLogin() {
  const navigate = useNavigate();
  return useMutation({
    // LoginForm renders login.error next to the fields, so the global
    // MutationCache toast would say the same thing a second time.
    meta: { silent: true },

    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signIn(email, password),

    onSuccess: () => {
      navigate("/");
    },
  });
}
