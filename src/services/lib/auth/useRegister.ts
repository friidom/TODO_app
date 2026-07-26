import { useMutation } from "@tanstack/react-query";
import { signUp } from "../../api/authApi";

export function useRegister() {
  return useMutation({
    mutationFn: ({
      email,
      password,
    }: {
      email: string;
      password: string;
    }) => signUp(email, password),
  });
}