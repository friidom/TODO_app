import { useMutation } from "@tanstack/react-query";
import { signUp } from "../../api/authApi";
import { useNavigate } from "react-router";

export function useRegister() {
  const navigate = useNavigate();
  return useMutation({
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