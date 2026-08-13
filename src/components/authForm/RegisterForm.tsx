import { useState } from "react";
import { Link, useLocation } from "react-router";
import { Loader2 } from "lucide-react";

import { useRegister } from "@/services/auth/useRegister";
import {
  hasErrors,
  validateAuthForm,
  type AuthFieldErrors,
} from "@/utils/validation";

export default function RegisterForm() {
  const register = useRegister();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<AuthFieldErrors>({});

  /** Drop stale feedback as soon as the user acts on it. */
  function clearFeedback(field: keyof AuthFieldErrors) {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

    if (register.isError) register.reset();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Trimmed for the request too, not only for the check — a padded address
    // would otherwise register an account nobody can log into.
    const trimmedEmail = email.trim();
    const fieldErrors = validateAuthForm(trimmedEmail, password);

    setErrors(fieldErrors);

    if (hasErrors(fieldErrors)) return;

    register.mutate({ email: trimmedEmail, password });
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex w-full max-w-md flex-col gap-4 rounded-xl bg-white p-8"
    >
      <h1 className="text-3xl font-bold">Register</h1>

      <div className="flex flex-col gap-1">
        <input
          type="email"
          placeholder="Email"
          className="rounded border p-3"
          value={email}
          disabled={register.isPending}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "register-email-error" : undefined}
          onChange={(e) => {
            setEmail(e.target.value);
            clearFeedback("email");
          }}
        />

        {errors.email && (
          <p id="register-email-error" className="text-sm text-red-600">
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
          disabled={register.isPending}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={
            errors.password ? "register-password-error" : undefined
          }
          onChange={(e) => {
            setPassword(e.target.value);
            clearFeedback("password");
          }}
        />

        {errors.password && (
          <p id="register-password-error" className="text-sm text-red-600">
            {errors.password}
          </p>
        )}
      </div>

      {/* Whatever the server said — address already registered, weak password. */}
      {register.isError && (
        <p role="alert" className="text-sm text-red-600">
          {register.error.message}
        </p>
      )}

      <button
        className="flex cursor-pointer items-center justify-center rounded bg-violet-600 p-3 text-center text-white disabled:cursor-not-allowed disabled:opacity-70"
        type="submit"
        disabled={register.isPending}
      >
        {register.isPending ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Creating account...
          </>
        ) : (
          "Register"
        )}
      </button>

      <p className="text-center">
        Already have an account?{" "}
        {/* Carries `next` back the other way, so an invitee who turns out to
            have an account already still returns to the invite. */}
        <Link
          to={{ pathname: "/login", search: location.search }}
          className="font-semibold text-violet-600"
        >
          Login
        </Link>
      </p>
    </form>
  );
}
