import { Navigate, Outlet } from "react-router";
import { useAuth } from "../../services/lib";
import Loading from "../pages/loading/LoadingPage";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
