import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Link } from "react-router";
import { Loader2, MailCheckIcon } from "lucide-react";

import AuthField from "@/components/authForm/AuthField";
import AuthShell from "@/components/authForm/AuthShell";
import { FORM_SUBMIT } from "@/components/ui/fieldInput";
import { useRequestPasswordReset } from "@/services/auth/usePasswordReset";
import { validateEmail } from "@/utils/validation";

// Success message is identical whether or not the address exists — otherwise this screen is an account-existence oracle.
export default function ForgotPasswordPage() {
  const { t } = useTranslation();
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
        title={t("auth.checkEmail")}
        subtitle={t("auth.resetSentSubtitle")}
        footer={<Link to="/login">{t("auth.backToSignIn")}</Link>}
      >
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="bg-brand-soft text-brand grid size-11 place-items-center rounded-full">
            <MailCheckIcon className="size-5" />
          </span>

          <p className="text-ink-2 text-sm leading-relaxed">
            {t("auth.resetSentPrefix")}{" "}
            <span className="text-ink font-medium">{email.trim()}</span>{" "}
            {t("auth.resetSentSuffix")}
          </p>

          <button
            type="button"
            onClick={() => request.reset()}
            className="text-ink-3 hover:text-ink focus-visible:ring-brand rounded text-xs transition-colors outline-none focus-visible:ring-2"
          >
            {t("auth.differentAddress")}
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("auth.resetTitle")}
      subtitle={t("auth.resetSubtitleForm")}
      footer={<Link to="/login">{t("auth.backToSignIn")}</Link>}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <AuthField
          id="forgot-email"
          label={t("auth.email")}
          type="email"
          placeholder={t("auth.emailPlaceholder")}
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
              {t("auth.sending")}
            </>
          ) : (
            t("auth.sendResetLink")
          )}
        </button>
      </form>
    </AuthShell>
  );
}
