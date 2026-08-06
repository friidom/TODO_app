import { Navigate, Outlet } from "react-router";
import { useAuth } from "@/services/auth/useAuth";
import Loading from "../pages/loading/LoadingPage";

export default function PublicRoute() {
  const { user, loading } = useAuth();

  if (loading) return <Loading />;

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}