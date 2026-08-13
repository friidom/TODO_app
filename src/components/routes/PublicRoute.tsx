import { Navigate, Outlet, useSearchParams } from "react-router";
import { useAuth } from "@/services/auth/useAuth";
import { safeNext } from "@/utils/nextPath";
import Loading from "../loading/LoadingPage";

export default function PublicRoute() {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();

  if (loading) return <Loading />;

  if (user) {
    // Honours `next` for the same reason useLogin does, but covers a case the
    // mutation cannot: someone who was ALREADY signed in — in another tab, or
    // from a live session — following an invite link. They never submit the
    // form, so this guard is the only thing that sends them on.
    return <Navigate to={safeNext(searchParams.get("next")) ?? "/"} replace />;
  }

  return <Outlet />;
}
