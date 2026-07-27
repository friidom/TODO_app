import { useState } from "react";
import { useRegister } from "../../services/lib/auth/useRegister";
import { Link } from "react-router";

export default function RegisterForm() {
  const register = useRegister();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    register.mutate({
      email,
      password,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-md flex-col gap-4 rounded-xl bg-white p-8"
    >
      <h1 className="text-3xl font-bold">Register</h1>

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
        className="cursor-pointer rounded text-center bg-violet-600 p-3 text-white"
        type="submit"
      >
        Register
      </button>

      <p className="text-center">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-violet-600">
          Login
        </Link>
      </p>
    </form>
  );
}
