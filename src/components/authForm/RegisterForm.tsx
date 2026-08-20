import { useState } from "react";
import { Check, Loader2, X as XIcon } from "lucide-react";

import AuthField from "@/components/authForm/AuthField";
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
  type AuthFieldErrors,
} from "@/utils/validation";

export default function RegisterForm() {
  const register = useRegister();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<AuthFieldErrors>({});

  const availability = useUsernameAvailability(username);

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
    // would otherwise register an account nobody can log into. Same reasoning
    // for the username, which is stored lowercased.
    const trimmedEmail = email.trim();
    const canonicalUsername = normalizeUsername(username);
    const fieldErrors = validateAuthForm(
      trimmedEmail,
      password,
      canonicalUsername,
    );

    // **The last look at availability before committing.** It closes the window
    // between the debounced answer and the click, but not the one between the
    // click and confirmation — nothing here can, because the profile row is not
    // written until the address is confirmed. `profiles_username_lower_key` is
    // what actually guarantees uniqueness, and `provision_user` settles a
    // genuine race by taking the next free name rather than failing to
    // provision the account at all.
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
          // The field's own error wins over the live status: it is the more
          // specific of the two and it is the one the submit acted on.
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

/**
 * The live verdict on the username, under the field.
 *
 * **Deliberately not an error.** A name being taken is not a mistake anybody
 * made, and rendering it in the same red as "Enter a valid email address"
 * would say it was. `invalid` is the one status that *is* the user's typing,
 * and it is the one that borrows the error colour.
 *
 * `idle` renders nothing at all rather than a placeholder line: reserving space
 * under an untouched field draws the eye to a question nobody has been asked
 * yet.
 */
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

  // `error`. The check is advice, not a gate — the database decides — so a
  // failed lookup must not read as a refusal or block the submit.
  return (
    <p className="text-ink-3 mt-1.5 text-xs">
      Could not check that username right now.
    </p>
  );
}
