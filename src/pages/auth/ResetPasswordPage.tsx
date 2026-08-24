import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Loader2, TriangleAlertIcon } from "lucide-react";

import AuthShell from "@/components/authForm/AuthShell";
import PasswordInput from "@/components/authForm/PasswordInput";
import { FORM_SUBMIT } from "@/components/ui/fieldInput";
import { supabase } from "@/services/api/supabase";
import { useUpdatePassword } from "@/services/auth/usePasswordReset";
import {
  PASSWORD_MIN_LENGTH,
  validateConfirmPassword,
  validatePassword,
  type AuthFieldErrors,
} from "@/utils/validation";

/**
 * Step two: set the new password (M22).
 *
 * **Routed outside both guards, and that is load-bearing.** A Supabase recovery
 * link does not carry a token for this page to redeem — it *signs the user in*,
 * exchanging the URL fragment for a real session before any of this renders. So
 * `PublicRoute` would see a session and redirect to `/` before the form could
 * be used, and `ProtectedRoute` would be no better if the exchange had not
 * finished yet. `/invite/:token` sits outside both for the same kind of reason.
 *
 * **Why the session is awaited rather than read once.** The exchange is
 * asynchronous and races this component's first render: `getSession()` can
 * legitimately answer null a tick before the recovery session lands. Reading it
 * once and rendering "link expired" on null would show that message to
 * everybody, every time, on a link that is perfectly good. So this waits for
 * either — `PASSWORD_RECOVERY`/`SIGNED_IN` from the subscription, or a session
 * that is already there — and only calls the link dead once neither has
 * appeared.
 */

/** How long to wait for the recovery session before calling the link dead. */
const RECOVERY_TIMEOUT_MS = 4000;

type Status = "checking" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<Status>("checking");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<AuthFieldErrors>({});

  const update = useUpdatePassword();

  useEffect(() => {
    let settled = false;

    const ready = () => {
      if (settled) return;

      settled = true;
      setStatus("ready");
    };

    // The event, for the ordinary case where the exchange completes after this
    // component mounts. `PASSWORD_RECOVERY` is what a recovery link fires;
    // `SIGNED_IN` covers the versions and flows that report it that way.
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") ready();
    });

    // And the poll-free fallback for the case where it completed *before* we
    // subscribed — a full page load on a slow render, or a revisit with the
    // session already in storage.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) ready();
    });

    const timer = setTimeout(() => {
      if (settled) return;

      settled = true;
      setStatus("invalid");
    }, RECOVERY_TIMEOUT_MS);

    return () => {
      subscription.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const fieldErrors: AuthFieldErrors = {};
    const passwordError = validatePassword(password);

    if (passwordError) fieldErrors.password = passwordError;
    else {
      const mismatch = validateConfirmPassword(password, confirmPassword);

      if (mismatch) fieldErrors.confirmPassword = mismatch;
    }

    setErrors(fieldErrors);

    if (fieldErrors.password || fieldErrors.confirmPassword) return;

    update.mutate(password);
  }

  if (status === "checking") {
    return (
      <AuthShell
        title="Checking your link"
        subtitle="One moment."
        footer={<Link to="/login">Back to sign in</Link>}
      >
        <div className="text-ink-3 flex items-center justify-center gap-2 py-6 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Verifying…
        </div>
      </AuthShell>
    );
  }

  if (status === "invalid") {
    return (
      <AuthShell
        title="That link has expired"
        subtitle="Reset links are single-use and last about an hour."
        footer={<Link to="/login">Back to sign in</Link>}
      >
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="bg-status-red/10 text-status-red grid size-11 place-items-center rounded-full">
            <TriangleAlertIcon className="size-5" />
          </span>

          <p className="text-ink-2 text-sm leading-relaxed">
            Ask for a new one and it will work straight away.
          </p>

          <Link to="/forgot-password" className={`${FORM_SUBMIT} mt-2`}>
            Send a new link
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose something you have not used here before."
      footer={<Link to="/login">Back to sign in</Link>}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <PasswordInput
          id="reset-password"
          label="New password"
          placeholder="••••••••"
          autoComplete="new-password"
          value={password}
          error={errors.password}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          disabled={update.isPending}
          onChange={(value) => {
            setPassword(value);
            setErrors((prev) => ({ ...prev, password: undefined }));
            if (update.isError) update.reset();
          }}
        />

        <PasswordInput
          id="reset-confirm-password"
          label="Confirm new password"
          autoComplete="new-password"
          value={confirmPassword}
          error={errors.confirmPassword}
          disabled={update.isPending}
          onChange={(value) => {
            setConfirmPassword(value);
            setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
            if (update.isError) update.reset();
          }}
        />

        {update.isError && (
          <p
            role="alert"
            className="border-status-red/30 bg-status-red/10 text-status-red rounded-control border px-3 py-2 text-xs"
          >
            {update.error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={update.isPending}
          className={FORM_SUBMIT}
        >
          {update.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Updating…
            </>
          ) : (
            "Update password"
          )}
        </button>
      </form>
    </AuthShell>
  );
}
