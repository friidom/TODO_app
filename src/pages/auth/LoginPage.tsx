import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { Link, useLocation, useSearchParams } from "react-router";

import AuthShell from "@/components/authForm/AuthShell";
import LoginForm from "@/components/authForm/LoginForm";
import { OAUTH_PROVIDER_LABEL } from "@/services/auth/oauthApi";
import { oauthErrorMessage } from "@/services/auth/oauthErrors";
import {
  clearPendingLink,
  linkingProviderOf,
  storePendingLink,
} from "@/services/auth/pendingLink";

export default function LoginPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // set by ProtectedRoute when it turns away an unconfirmed session
  const unconfirmed = searchParams.get("unconfirmed") === "1";

  // set by useUpdatePassword after a reset, so the bounce back doesn't read as a failure
  const justReset = searchParams.get("reset") === "1";

  // set by VerifyEmailPage once the link has been used
  const justVerified = searchParams.get("verified") === "1";

  const { t } = useTranslation();
  const oauthError = oauthErrorMessage(searchParams.get("error"));

  const link = searchParams.get("link");

  // Moved out of the URL immediately: it is single use, and a challenge token
  // sitting in the address bar survives into history and into the Referer of
  // whatever the person clicks next. OAuthLinkCompleter spends it once a
  // session exists.
  useEffect(() => {
    if (link === null) return;

    storePendingLink(link);

    const next = new URLSearchParams(searchParams);

    next.delete("link");
    next.delete("provider");
    // Replaced by a marker rather than simply removed: this navigation
    // re-renders immediately, and without it the page would flip back to
    // "Welcome back" and stop explaining why a sign-in is being asked for.
    next.set("linking", linkingProviderOf(searchParams.get("provider")) ?? "1");
    setSearchParams(next, { replace: true });
  }, [link, searchParams, setSearchParams]);

  const linking = link !== null || searchParams.has("linking");
  const linkingProvider = linkingProviderOf(
    searchParams.get("linking") ?? searchParams.get("provider"),
  );

  function cancelLinking() {
    clearPendingLink();
    setSearchParams({}, { replace: true });
  }

  function subtitle() {
    if (linking) {
      return linkingProvider
        ? t("auth.linkingSubtitleProvider", {
            provider: OAUTH_PROVIDER_LABEL[linkingProvider],
          })
        : t("auth.linkingSubtitle");
    }

    if (unconfirmed) {
      return t("auth.unconfirmedSubtitle");
    }

    if (justReset) return t("auth.resetSubtitle");

    if (justVerified) return t("auth.verifiedSubtitle");

    return t("auth.loginSubtitle");
  }

  return (
    <AuthShell
      title={linking ? t("auth.confirmItsYou") : t("auth.welcomeBack")}
      subtitle={subtitle()}
      footer={
        linking ? (
          // a second account is exactly what this page exists to avoid, so it offers a way out instead
          <button
            type="button"
            onClick={cancelLinking}
            className="text-ink hover:text-brand font-medium transition-colors"
          >
            {t("auth.linkingCancel")}
          </button>
        ) : (
          <>
            {t("auth.noAccount")}{" "}
            <Link
              to={{ pathname: "/register", search: location.search }}
              className="text-ink hover:text-brand font-medium transition-colors"
            >
              {t("auth.createOne")}
            </Link>
          </>
        )
      }
    >
      {oauthError !== null && !linking && (
        <p
          role="alert"
          className="border-status-red/30 bg-status-red/10 text-status-red rounded-control mb-4 border px-3 py-2 text-xs"
        >
          {oauthError}
        </p>
      )}

      <LoginForm />
    </AuthShell>
  );
}
