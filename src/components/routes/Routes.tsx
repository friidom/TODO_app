import { Suspense, type ReactNode } from "react";
import { createBrowserRouter } from "react-router";

import ProtectedRoute from "./ProtectedRoute";
import SuperadminRoute from "./SuperadminRoute";
import ForYouPage from "@/pages/forYou/ForYouPage";
import PublicRoute from "./PublicRoute";
import LoginPage from "@/pages/auth/LoginPage";
import NotFoundPage from "@/pages/error/NotFoundPage";
import RouteErrorPage from "@/pages/error/RouteErrorPage";
import Loading from "@/components/loading/LoadingPage";
import {
  AdminActivityPage,
  AdminBoardsPage,
  AdminDashboardPage,
  AdminKpiPage,
  AdminUserPage,
  AdminUsersPage,
  BoardPage,
  ForgotPasswordPage,
  InvitePage,
  ProfilePage,
  RegisterPage,
  ResetPasswordPage,
} from "./lazyPages";

// login/ForYou stay eager since they're the first paint; error pages stay eager since a failed lazy import inside one is a dead end
const deferred = (element: ReactNode) => (
  <Suspense fallback={<Loading />}>{element}</Suspense>
);

export const router = createBrowserRouter([
  {
    element: <ProtectedRoute />,
    errorElement: <RouteErrorPage />,
    children: [
      // "/" is the personal hub, not a redirect to an arbitrary board
      {
        path: "/",
        element: <ForYouPage />,
      },
      {
        path: "/boards/:boardId",
        element: deferred(<BoardPage />),
      },
      {
        path: "/profile",
        element: deferred(<ProfilePage />),
      },

      // Nested inside ProtectedRoute so sign-in and verification still run
      // first; every page is lazy, so a normal user never fetches the bundle.
      {
        element: <SuperadminRoute />,
        children: [
          { path: "/admin", element: deferred(<AdminDashboardPage />) },
          { path: "/admin/users", element: deferred(<AdminUsersPage />) },
          { path: "/admin/users/:id", element: deferred(<AdminUserPage />) },
          { path: "/admin/boards", element: deferred(<AdminBoardsPage />) },
          { path: "/admin/activity", element: deferred(<AdminActivityPage />) },
          { path: "/admin/kpi", element: deferred(<AdminKpiPage />) },
        ],
      },
    ],
  },

  {
    element: <PublicRoute />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        path: "/register",
        element: deferred(<RegisterPage />),
      },
      {
        path: "/login",
        element: <LoginPage />,
      },
      {
        path: "/forgot-password",
        element: deferred(<ForgotPasswordPage />),
      },
    ],
  },

  // outside both guards — has to work signed in or out; page gates itself and carries the token via ?next=
  {
    path: "/invite/:token",
    element: deferred(<InvitePage />),
    errorElement: <RouteErrorPage />,
  },

  // outside both guards — the recovery link signs the user in before this renders, so PublicRoute would redirect it away
  {
    path: "/reset-password",
    element: deferred(<ResetPasswordPage />),
    errorElement: <RouteErrorPage />,
  },

  // outside both guards — a bad URL should say so, not bounce to /login
  {
    path: "*",
    element: <NotFoundPage />,
    errorElement: <RouteErrorPage />,
  },
]);
