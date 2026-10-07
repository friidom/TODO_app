import { useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import OAuthLinkCompleter from "@/components/auth/OAuthLinkCompleter";
import { useAuth } from "@/services/auth/useAuth";
import type { AuthUser } from "@/services/auth/session";
import { loginPath } from "@/utils/nextPath";
import Loading from "../loading/LoadingPage";

function isConfirmed(user: AuthUser) {
  return user.email_verified_at !== null;
}

// Defence in depth, not the real gate — the API already refuses a session to an
// unverified account when verification is required.
export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [hadSession, setHadSession] = useState(false);

  if (user && !hadSession) setHadSession(true);

  if (loading) return <Loading />;

  if (!user) {
    // A session that ended on this page was signed out of, so the page is not a
    // destination to return to — otherwise signing out on Profile lands the next
    // sign-in back on Profile.
    return (
      <Navigate to={hadSession ? "/login" : loginPath(location)} replace />
    );
  }

  if (!isConfirmed(user)) {
    return <Navigate to="/login?unconfirmed=1" replace />;
  }

  return (
    <>
      {/* Spends a parked link challenge now that a session exists. */}
      <OAuthLinkCompleter />
      <Outlet />
    </>
  );
}
