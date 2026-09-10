import { Navigate, Outlet } from "react-router";
import type { User } from "@supabase/supabase-js";
import { useAuth } from "@/services/auth/useAuth";
import Loading from "../loading/LoadingPage";

// Checks all three, not just email — OAuth/phone accounts confirm differently and would otherwise get locked out.
function isConfirmed(user: User) {
  return Boolean(
    user.email_confirmed_at ?? user.phone_confirmed_at ?? user.confirmed_at,
  );
}

// Defence in depth, not the real gate — Supabase's enable_confirmations already refuses a session to unconfirmed accounts.
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
