import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CircleCheck, Loader2, TriangleAlertIcon } from "lucide-react";

import AuthField from "@/components/authForm/AuthField";
import AuthShell from "@/components/authForm/AuthShell";
import ResendVerification from "@/components/authForm/ResendVerification";
import { FORM_SUBMIT } from "@/components/ui/fieldInput";
import { useVerifyEmail } from "@/services/auth/useEmailVerification";

// Outside PublicRoute and ProtectedRoute, like the reset link: it has to work whether or not someone is signed in.
export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const verify = useVerifyEmail();
  const [email, setEmail] = useState("");

  // The token is single use: StrictMode's second effect run would spend it a second time and report failure.
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;

    sent.current = true;
    verify.mutate(token);
  }, [token, verify]);

  if (verify.isSuccess) {
    return (
      <AuthShell
        title={t("auth.emailVerifiedTitle")}
        subtitle={t("auth.emailVerifiedSubtitle")}
        footer={null}
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <span className="bg-status-green/10 text-status-green grid size-11 place-items-center rounded-full">
            <CircleCheck className="size-5" />
          </span>

          <Link to="/login?verified=1" replace className={FORM_SUBMIT}>
            {t("auth.signIn")}
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (token && !verify.isError) {
    return (
      <AuthShell
        title={t("auth.verifyingTitle")}
        subtitle={t("auth.verifyingSubtitle")}
        footer={null}
      >
        <div className="flex justify-center py-6">
          <Loader2 aria-hidden className="text-ink-3 size-6 animate-spin" />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("auth.verifyLinkInvalidTitle")}
      subtitle={t("auth.verifyLinkInvalidSubtitle")}
      footer={<Link to="/login">{t("auth.backToSignIn")}</Link>}
    >
      <div className="flex flex-col gap-4">
        <span className="bg-status-red/10 text-status-red mx-auto grid size-11 place-items-center rounded-full">
          <TriangleAlertIcon className="size-5" />
        </span>

        <AuthField
          id="verify-email"
          label={t("auth.email")}
          type="email"
          autoComplete="email"
          placeholder={t("auth.emailPlaceholder")}
          value={email}
          onChange={setEmail}
        />

        <ResendVerification email={email} />
      </div>
    </AuthShell>
  );
}
