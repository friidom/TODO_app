import { useMutation } from "@tanstack/react-query";
import { signIn } from "../../api/authApi";

export function useLogin() {
  return useMutation({
    mutationFn: ({
      email,
      password,
    }: {
      email: string;
      password: string;
    }) => signIn(email, password),
  });
}