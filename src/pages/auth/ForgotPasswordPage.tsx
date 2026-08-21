import { useState } from "react";
import { Link } from "react-router";
import { Loader2, MailCheckIcon } from "lucide-react";

import AuthField from "@/components/authForm/AuthField";
import AuthShell from "@/components/authForm/AuthShell";
import { FORM_SUBMIT } from "@/components/ui/fieldInput";
import { useRequestPasswordReset } from "@/services/auth/usePasswordReset";
import { validateEmail } from "@/utils/validation";

/**
 * Step one of getting back in (M22).
 *
 * **The product had no way back at all before this.** Forgetting a password
 * meant the account was gone — no reset, no recovery, nothing in the codebase
 * — which is why this is the piece of the polish pass that mattered most.
 *
 * **The success state is the same whether or not the address exists**, and it
 * is worded to say so. Confirming "we sent you a link" only for real accounts
 * turns this screen into an account-existence oracle that needs no password and
 * no rate limit to walk. Supabase behaves this way at its end too; the
 * mutation deliberately does not inspect the result.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();

  const request = useRequestPasswordReset();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = email.trim();
    const emailError = validateEmail(trimmed);

    setError(emailError);

    if (emailError) return;

    request.mutate(trimmed);
  }

  if (request.isSuccess) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="If an account exists for that address, a reset link is on its way."
        footer={<Link to="/login">Back to sign in</Link>}
      >
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="bg-brand-soft text-brand grid size-11 place-items-center rounded-full">
            <MailCheckIcon className="size-5" />
          </span>

          <p className="text-ink-2 text-sm leading-relaxed">
            Open the link in{" "}
            <span className="text-ink font-medium">{email.trim()}</span> to set
            a new password. It expires in an hour.
          </p>

          {/* Deliberately here rather than as an auto-retry: a resend that fires
              on its own is how someone ends up with four links, three of which
              are dead by the time they read the mail. */}
          <button
            type="button"
            onClick={() => request.reset()}
            className="text-ink-3 hover:text-ink focus-visible:ring-brand rounded text-xs transition-colors outline-none focus-visible:ring-2"
          >
            Use a different address
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a link to set a new one."
      footer={<Link to="/login">Back to sign in</Link>}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <AuthField
          id="forgot-email"
          label="Email"
          type="email"
          placeholder="you@company.com"
          autoComplete="email"
          value={email}
          error={error}
          disabled={request.isPending}
          onChange={(value) => {
            setEmail(value);
            setError(undefined);
            if (request.isError) request.reset();
          }}
        />

        {/* A transport failure, not a wrong address — the mutation cannot tell
            you whether the account exists and does not try. */}
        {request.isError && (
          <p
            role="alert"
            className="border-status-red/30 bg-status-red/10 text-status-red rounded-control border px-3 py-2 text-xs"
          >
            {request.error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={request.isPending}
          className={FORM_SUBMIT}
        >
          {request.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Sending…
            </>
          ) : (
            "Send reset link"
          )}
        </button>
      </form>
    </AuthShell>
  );
}
