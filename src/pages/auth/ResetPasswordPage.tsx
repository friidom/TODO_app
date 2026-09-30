import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Loader2, TriangleAlertIcon } from "lucide-react";

import AuthShell from "@/components/authForm/AuthShell";
import PasswordInput from "@/components/authForm/PasswordInput";
import { FORM_SUBMIT } from "@/components/ui/fieldInput";
import { useUpdatePassword } from "@/services/auth/usePasswordReset";
import {
  PASSWORD_MIN_LENGTH,
  validateConfirmPassword,
  validatePassword,
  type AuthFieldErrors,
} from "@/utils/validation";

// Routed outside PublicRoute and ProtectedRoute: PublicRoute would send an
// already-signed-in user away from their own reset link.

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<AuthFieldErrors>({});

  const update = useUpdatePassword();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!token) return;

    const fieldErrors: AuthFieldErrors = {};
    const passwordError = validatePassword(password);

    if (passwordError) fieldErrors.password = passwordError;
    else {
      const mismatch = validateConfirmPassword(password, confirmPassword);

      if (mismatch) fieldErrors.confirmPassword = mismatch;
    }

    setErrors(fieldErrors);

    if (fieldErrors.password || fieldErrors.confirmPassword) return;

    update.mutate({ token, password });
  }

  if (!token) {
    return (
      <AuthShell
        title={t("auth.linkExpiredTitle")}
        subtitle={t("auth.linkExpiredSubtitle")}
        footer={<Link to="/login">{t("auth.backToSignIn")}</Link>}
      >
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="bg-status-red/10 text-status-red grid size-11 place-items-center rounded-full">
            <TriangleAlertIcon className="size-5" />
          </span>

          <p className="text-ink-2 text-sm leading-relaxed">
            {t("auth.askNewLink")}
          </p>

          <Link to="/forgot-password" className={`${FORM_SUBMIT} mt-2`}>
            {t("auth.sendNewLink")}
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("auth.newPasswordTitle")}
      subtitle={t("auth.newPasswordSubtitle")}
      footer={<Link to="/login">{t("auth.backToSignIn")}</Link>}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <PasswordInput
          id="reset-password"
          label={t("auth.newPassword")}
          placeholder="••••••••"
          autoComplete="new-password"
          value={password}
          error={errors.password}
          hint={t("auth.atLeast", { count: PASSWORD_MIN_LENGTH })}
          disabled={update.isPending}
          onChange={(value) => {
            setPassword(value);
            setErrors((prev) => ({ ...prev, password: undefined }));
            if (update.isError) update.reset();
          }}
        />

        <PasswordInput
          id="reset-confirm-password"
          label={t("auth.confirmNewPassword")}
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
              {t("auth.updating")}
            </>
          ) : (
            t("auth.updatePassword")
          )}
        </button>
      </form>
    </AuthShell>
  );
}
