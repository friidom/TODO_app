import { useState } from "react";
import { Link } from "react-router";
import { Loader2 } from "lucide-react";

import AuthField from "@/components/authForm/AuthField";
import PasswordInput from "@/components/authForm/PasswordInput";
import { FORM_SUBMIT } from "@/components/ui/fieldInput";
import { useLogin } from "@/services/auth/useLogin";
import {
  hasErrors,
  validateIdentifier,
  validatePassword,
  type AuthFieldErrors,
} from "@/utils/validation";

export default function LoginForm() {
  const login = useLogin();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<AuthFieldErrors>({});

  function clearFeedback(field: keyof AuthFieldErrors) {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

    if (login.isError) login.reset();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = identifier.trim();

    const fieldErrors: AuthFieldErrors = {};
    const identifierError = validateIdentifier(trimmed);
    const passwordError = validatePassword(password);

    if (identifierError) fieldErrors.email = identifierError;
    if (passwordError) fieldErrors.password = passwordError;

    setErrors(fieldErrors);

    if (hasErrors(fieldErrors)) return;

    login.mutate({ identifier: trimmed, password });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {/* type="text", not "email" — the browser's own validation would reject a username */}
      <AuthField
        id="login-identifier"
        label="Email or username"
        type="text"
        placeholder="you@company.com or ada_lovelace"
        autoComplete="username"
        value={identifier}
        error={errors.email}
        disabled={login.isPending}
        onChange={(value) => {
          setIdentifier(value);
          clearFeedback("email");
        }}
      />

      <PasswordInput
        id="login-password"
        label="Password"
        autoComplete="current-password"
        value={password}
        error={errors.password}
        disabled={login.isPending}
        onChange={(value) => {
          setPassword(value);
          clearFeedback("password");
        }}
        labelAction={
          <Link
            to="/forgot-password"
            className="text-ink-3 hover:text-ink focus-visible:ring-brand rounded text-xs transition-colors outline-none focus-visible:ring-2"
          >
            Forgot password?
          </Link>
        }
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
