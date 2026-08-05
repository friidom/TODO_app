import { useState } from "react";
import { Link } from "react-router";
import { Loader2 } from "lucide-react";

import { useLogin } from "../../services/lib/auth/useLogin";
import {
  hasErrors,
  validateAuthForm,
  type AuthFieldErrors,
} from "@/utils/validation";

export default function LoginForm() {
  const login = useLogin();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<AuthFieldErrors>({});

  /** Drop stale feedback as soon as the user acts on it. */
  function clearFeedback(field: keyof AuthFieldErrors) {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

    if (login.isError) login.reset();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Trimmed for the request too, not only for the check — otherwise a padded
    // address passes validation and then fails at the server.
    const trimmedEmail = email.trim();
    const fieldErrors = validateAuthForm(trimmedEmail, password);

    setErrors(fieldErrors);

    if (hasErrors(fieldErrors)) return;

    login.mutate({ email: trimmedEmail, password });
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex w-full max-w-md flex-col gap-4 rounded-xl bg-white p-8"
    >
      <h1 className="text-3xl font-bold">Login</h1>

      <div className="flex flex-col gap-1">
        <input
          type="email"
          placeholder="Email"
          className="rounded border p-3"
          value={email}
          disabled={login.isPending}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "login-email-error" : undefined}
          onChange={(e) => {
            setEmail(e.target.value);
            clearFeedback("email");
          }}
        />

        {errors.email && (
          <p id="login-email-error" className="text-sm text-red-600">
            {errors.email}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <input
          type="password"
          placeholder="Password"
          className="rounded border p-3"
          value={password}
          disabled={login.isPending}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={
            errors.password ? "login-password-error" : undefined
          }
          onChange={(e) => {
            setPassword(e.target.value);
            clearFeedback("password");
          }}
        />

        {errors.password && (
          <p id="login-password-error" className="text-sm text-red-600">
            {errors.password}
          </p>
        )}
      </div>

      {/* Whatever the server said — wrong password, unconfirmed address. */}
      {login.isError && (
        <p role="alert" className="text-sm text-red-600">
          {login.error.message}
        </p>
      )}

      <button
        className="flex cursor-pointer items-center justify-center rounded bg-violet-600 p-3 text-white disabled:cursor-not-allowed disabled:opacity-70"
        type="submit"
        disabled={login.isPending}
      >
        {login.isPending ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Logging in...
          </>
        ) : (
          "Login"
        )}
      </button>

      <p className="text-center">
        Don't have an account?{" "}
        <Link to="/register" className="font-semibold text-violet-600">
          Register
        </Link>
      </p>
    </form>
  );
}
