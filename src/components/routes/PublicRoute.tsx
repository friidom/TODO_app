import { Navigate, Outlet, useSearchParams } from "react-router";
import { useAuth } from "@/services/auth/useAuth";
import { safeNext } from "@/utils/nextPath";
import Loading from "../loading/LoadingPage";

export default function PublicRoute() {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();

  if (loading) return <Loading />;

  if (user) {
    // covers someone already signed in (another tab) hitting an invite link — they never submit the login form
    return <Navigate to={safeNext(searchParams.get("next")) ?? "/"} replace />;
  }

  return <Outlet />;
}
