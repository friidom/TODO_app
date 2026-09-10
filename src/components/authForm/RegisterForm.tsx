import { useState } from "react";
import { Check, Loader2, X as XIcon } from "lucide-react";

import AuthField from "@/components/authForm/AuthField";
import PasswordInput from "@/components/authForm/PasswordInput";
import { FORM_SUBMIT } from "@/components/ui/fieldInput";
import { useRegister } from "@/services/auth/useRegister";
import {
  useUsernameAvailability,
  type UsernameAvailability,
} from "@/services/auth/useUsernameAvailability";
import { normalizeUsername } from "@/utils/username";
import {
  hasErrors,
  validateAuthForm,
  validateConfirmPassword,
  PASSWORD_MIN_LENGTH,
  type AuthFieldErrors,
} from "@/utils/validation";

export default function RegisterForm() {
  const register = useRegister();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<AuthFieldErrors>({});

  const availability = useUsernameAvailability(username);

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

  function clearFeedback(field: keyof AuthFieldErrors) {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

    if (register.isError) register.reset();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedEmail = email.trim();
    const canonicalUsername = normalizeUsername(username);
    const fieldErrors = validateAuthForm(
      trimmedEmail,
      password,
      canonicalUsername,
    );

    // only check confirm-password once the password itself passes — no point stacking two complaints about one field
    if (!fieldErrors.password) {
      const mismatch = validateConfirmPassword(password, confirmPassword);

      if (mismatch) fieldErrors.confirmPassword = mismatch;
    }

    // last check before committing — the DB unique constraint is what actually guarantees this, this just closes most of the window
    if (!fieldErrors.username && availability.status === "taken") {
      fieldErrors.username = "That username is already taken.";
    }

    setErrors(fieldErrors);

    if (hasErrors(fieldErrors)) return;

    register.mutate({
      email: trimmedEmail,
      password,
      username: canonicalUsername,
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div>
        <AuthField
          id="register-username"
          label="Username"
          type="text"
          placeholder="ada_lovelace"
          autoComplete="username"
          value={username}
          error={errors.username}
          disabled={register.isPending}
          onChange={(value) => {
            setUsername(value);
            clearFeedback("username");
          }}
        />

        {!errors.username && <UsernameStatusLine availability={availability} />}
      </div>

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

      <PasswordInput
        id="register-password"
        label="Password"
        placeholder="••••••••"
        autoComplete="new-password"
        value={password}
        error={errors.password}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        disabled={register.isPending}
        onChange={(value) => {
          setPassword(value);
          clearFeedback("password");
        }}
      />

      <PasswordInput
        id="register-confirm-password"
        label="Confirm password"
        autoComplete="new-password"
        value={confirmPassword}
        error={errors.confirmPassword}
        disabled={register.isPending}
        onChange={(value) => {
          setConfirmPassword(value);
          clearFeedback("confirmPassword");
        }}
      />

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

// "taken" isn't rendered as an error — nobody did anything wrong. only "invalid" borrows the error color.
function UsernameStatusLine({
  availability,
}: {
  availability: UsernameAvailability;
}) {
  if (availability.status === "idle") return null;

  if (availability.status === "checking") {
    return (
      <p className="text-ink-3 mt-1.5 flex items-center gap-1.5 text-xs">
        <Loader2 size={12} className="animate-spin" />
        Checking availability…
      </p>
    );
  }

  if (availability.status === "invalid") {
    return (
      <p className="text-status-red mt-1.5 text-xs">{availability.message}</p>
    );
  }

  if (availability.status === "available") {
    return (
      <p className="text-status-green mt-1.5 flex items-center gap-1.5 text-xs">
        <Check size={12} />
        That username is available.
      </p>
    );
  }

  if (availability.status === "taken") {
    return (
      <p className="text-ink-2 mt-1.5 flex items-center gap-1.5 text-xs">
        <XIcon size={12} />
        That username is already taken.
      </p>
    );
  }

  return (
    <p className="text-ink-3 mt-1.5 text-xs">
      Could not check that username right now.
    </p>
  );
}
