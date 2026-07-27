import { useMutation } from "@tanstack/react-query";
import { signIn } from "../../api/authApi";
import { useNavigate } from "react-router";
export function useLogin() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      signIn(email, password),

    onSuccess: () => {
      navigate("/");
    },
  });
}
