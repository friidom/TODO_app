import { useState } from "react";
import { Loader2 } from "lucide-react";

import AuthField from "@/components/authForm/AuthField";
import { FORM_SUBMIT } from "@/components/ui/fieldInput";
import { useLogin } from "@/services/auth/useLogin";
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
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <AuthField
        id="login-email"
        label="Email"
        type="email"
        placeholder="you@company.com"
        autoComplete="email"
        value={email}
        error={errors.email}
        disabled={login.isPending}
        onChange={(value) => {
          setEmail(value);
          clearFeedback("email");
        }}
      />

      <AuthField
        id="login-password"
        label="Password"
        type="password"
        placeholder="••••••••"
        autoComplete="current-password"
        value={password}
        error={errors.password}
        disabled={login.isPending}
        onChange={(value) => {
          setPassword(value);
          clearFeedback("password");
        }}
      />

      {/* Whatever the server said — wrong password, unconfirmed address. */}
      {login.isError && (
        <p
          role="alert"
          className="border-status-red/30 bg-status-red/10 text-status-red rounded-control border px-3 py-2 text-xs"
        >
          {login.error.message}
        </p>
      )}

      <button type="submit" disabled={login.isPending} className={FORM_SUBMIT}>
        {login.isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </button>
    </form>
  );
}
