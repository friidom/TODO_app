import { useEffect } from "react";
import { Link, useLocation, useSearchParams } from "react-router";

import AuthShell from "@/components/authForm/AuthShell";
import LoginForm from "@/components/authForm/LoginForm";
import { oauthErrorMessage } from "@/services/auth/oauthErrors";
import { storePendingLink } from "@/services/auth/pendingLink";

export default function LoginPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // set by ProtectedRoute when it turns away an unconfirmed session
  const unconfirmed = searchParams.get("unconfirmed") === "1";

  // set by useUpdatePassword after a reset, so the bounce back doesn't read as a failure
  const justReset = searchParams.get("reset") === "1";

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
    // Replaced by a marker rather than simply removed: this navigation
    // re-renders immediately, and without it the page would flip back to
    // "Welcome back" and stop explaining why a sign-in is being asked for.
    next.set("linking", "1");
    setSearchParams(next, { replace: true });
  }, [link, searchParams, setSearchParams]);

  const linking = link !== null || searchParams.get("linking") === "1";

  function subtitle() {
    if (linking) {
      return "An account already exists for that email address. Sign in to connect your new sign-in method to it.";
    }

    if (oauthError !== null) return oauthError;

    if (unconfirmed) {
      return "Confirm your email address first — check your inbox for the link we sent.";
    }

    if (justReset) return "Your password has been updated. Sign in with the new one.";

    return "Sign in to pick up where your board left off.";
  }

  return (
    <AuthShell
      title={linking ? "Confirm it's you" : "Welcome back"}
      subtitle={subtitle()}
      footer={
        <>
          Don't have an account?{" "}
          <Link
            to={{ pathname: "/register", search: location.search }}
            className="text-ink hover:text-brand font-medium transition-colors"
          >
            Create one
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
