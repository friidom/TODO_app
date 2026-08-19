import { useState } from "react";
import { Loader2 } from "lucide-react";

import AuthField from "@/components/authForm/AuthField";
import { FORM_SUBMIT } from "@/components/ui/fieldInput";
import { useRegister } from "@/services/auth/useRegister";
import {
  hasErrors,
  validateAuthForm,
  type AuthFieldErrors,
} from "@/utils/validation";

export default function RegisterForm() {
  const register = useRegister();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<AuthFieldErrors>({});

  // Rendered instead of the form once the account exists but the address has
  // not been confirmed. Replacing the form rather than sitting above it: the
  // fields are done with, and leaving them editable invites a second signup
  // for the address that was just used.
  if (register.isSuccess && register.data.needsConfirmation) {
    return (
      <div className="text-center">
        <p className="text-ink mb-2 text-base font-semibold">
          Check your email
        </p>

        <p className="text-ink-2 text-sm leading-relaxed">
          We sent a confirmation link to{" "}
          <span className="text-ink font-medium">
            {register.variables?.email}
          </span>
          . Open it to finish setting up your account — you will not be able to
          sign in until you do.
        </p>
      </div>
    );
  }

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
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <AuthField
        id="register-email"
        label="Email"
        type="email"
        placeholder="you@company.com"
        autoComplete="email"
        value={email}
        error={errors.email}
        disabled={register.isPending}
        onChange={(value) => {
          setEmail(value);
          clearFeedback("email");
        }}
      />

      <AuthField
        id="register-password"
        label="Password"
        type="password"
        placeholder="At least 6 characters"
        autoComplete="new-password"
        value={password}
        error={errors.password}
        disabled={register.isPending}
        onChange={(value) => {
          setPassword(value);
          clearFeedback("password");
        }}
      />

      {/* Whatever the server said — address already registered, weak password. */}
      {register.isError && (
        <p
          role="alert"
          className="border-status-red/30 bg-status-red/10 text-status-red rounded-control border px-3 py-2 text-xs"
        >
          {register.error.message}
        </p>
      )}

      <button
        type="submit"
        disabled={register.isPending}
        className={FORM_SUBMIT}
      >
        {register.isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Creating account…
          </>
        ) : (
          "Create account"
        )}
      </button>
    </form>
  );
}
