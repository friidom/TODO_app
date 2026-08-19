import { Navigate, Outlet } from "react-router";
import type { User } from "@supabase/supabase-js";
import { useAuth } from "@/services/auth/useAuth";
import Loading from "../loading/LoadingPage";

/**
 * Whether this account has proved it owns one of its identifiers.
 *
 * **Three fields, not one, so this does not break sign-in methods it was not
 * written for.** `email_confirmed_at` is the one email/password signup sets,
 * but an OAuth account is confirmed by the provider and a phone account by an
 * SMS code. Checking only the email field would lock both of those out of an
 * app they can legitimately use. `confirmed_at` is Supabase's own roll-up of
 * the other two and is the catch-all for anything added later.
 */
function isConfirmed(user: User) {
  return Boolean(
    user.email_confirmed_at ?? user.phone_confirmed_at ?? user.confirmed_at,
  );
}

/**
 * The gate on the authenticated application.
 *
 * **The confirmation check here is defence in depth, not the enforcement.**
 * The real rule is `enable_confirmations` in `supabase/config.toml`: with it
 * on, Supabase issues no session for an unconfirmed account at all, so this
 * branch should be unreachable through the sign-up form. It is here for the
 * cases that do not go through that form — a session minted before the setting
 * was turned on, or a future flow that produces one another way — because
 * "unreachable" is not a property worth betting the whole authenticated app on.
 *
 * It deliberately does **not** try to confirm anything itself. Sending the user
 * to `/login` is the honest outcome: they hold a session the app will not
 * accept, and the way out is the link in their inbox.
 */
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
