import { useMutation } from "@tanstack/react-query";
import { signUp } from "../../api/authApi";
import { useNavigate } from "react-router";

export function useRegister() {
  const navigate = useNavigate();
  return useMutation({
    // RegisterForm renders register.error next to the fields, so the global
    // MutationCache toast would say the same thing a second time.
    meta: { silent: true },

    mutationFn: ({
      email,
      password,
    }: {
      email: string;
      password: string;
    }) => signUp(email, password),
    onSuccess: () => {
      navigate("/");
    },
  });
}