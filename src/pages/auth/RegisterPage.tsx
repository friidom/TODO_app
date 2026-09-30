import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";

import AuthShell from "@/components/authForm/AuthShell";
import RegisterForm from "@/components/authForm/RegisterForm";

export default function RegisterPage() {
  const location = useLocation();
  const { t } = useTranslation();

  return (
    <AuthShell
      title={t("auth.registerTitle")}
      subtitle={t("auth.registerSubtitle")}
      footer={
        <>
          {t("auth.haveAccount")}{" "}
          {/* Carries `next` back the other way, so an invitee who turns out to
              have an account already still returns to the invite. */}
          <Link
            to={{ pathname: "/login", search: location.search }}
            className="text-ink hover:text-brand font-medium transition-colors"
          >
            {t("auth.signIn")}
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
