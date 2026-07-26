import { useState } from "react";
import { useLogin } from "../../services/lib/auth/useLogin";

interface LoginFormProps {
  onSwitch: () => void;
}

export default function LoginForm({ onSwitch }: LoginFormProps) {
  const login = useLogin();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    login.mutate({
      email,
      password,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-md flex-col gap-4 rounded-xl bg-white p-8"
    >
      <h1 className="text-3xl font-bold">Login</h1>

      <input
        type="email"
        placeholder="Email"
        className="rounded border p-3"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        type="password"
        placeholder="Password"
        className="rounded border p-3"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button
        className="rounded bg-violet-600 p-3 text-white"
        type="submit"
      >
        Login
      </button>

      <p className="text-center">
        Don't have an account?{" "}
        <button
          type="button"
          onClick={onSwitch}
          className="font-semibold text-violet-600"
        >
          Register
        </button>
      </p>
    </form>
  );
}