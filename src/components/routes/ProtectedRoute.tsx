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

  if (loading) return <Loading />;

  if (!user) {
    return <Navigate to={loginPath(location)} replace />;
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
