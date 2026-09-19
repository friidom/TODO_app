import { Navigate, Outlet } from "react-router";
import { useAuth } from "@/services/auth/useAuth";
import type { AuthUser } from "@/services/auth/session";
import Loading from "../loading/LoadingPage";

function isConfirmed(user: AuthUser) {
  return user.email_verified_at !== null;
}

// Defence in depth, not the real gate — the API already refuses a session to an
// unverified account when verification is required.
export default function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) return <Loading />;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isConfirmed(user)) {
    return <Navigate to="/login?unconfirmed=1" replace />;
  }

  return <Outlet />;
}
