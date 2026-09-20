import { Navigate, Outlet } from "react-router";

import Loading from "../loading/LoadingPage";
import { useAuth } from "@/services/auth/useAuth";

// Defence in depth, not the real gate — requireSuperadmin reads users.org_role
// on every /admin request and answers 404, so the endpoints refuse a normal
// user whatever this component renders.
export default function SuperadminRoute() {
  const { user, loading } = useAuth();

  if (loading) return <Loading />;

  // Not found rather than a redirect to a "forbidden" page, matching the API:
  // a dedicated denial screen would confirm the area exists.
  if (!user || user.org_role !== "superadmin") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
