import { Suspense, type ReactNode } from "react";
import { Navigate, Outlet, createBrowserRouter } from "react-router";

import ProtectedRoute from "./ProtectedRoute";
import SuperadminRoute from "./SuperadminRoute";
import ForYouPage from "@/pages/forYou/ForYouPage";
import PublicRoute from "./PublicRoute";
import LoginPage from "@/pages/auth/LoginPage";
import NotFoundPage from "@/pages/error/NotFoundPage";
import RouteErrorPage from "@/pages/error/RouteErrorPage";
import Layout from "@/components/layout/Layout";
import Loading from "@/components/loading/LoadingPage";
import {
  BoardPageSkeleton,
  RowsSkeleton,
} from "@/components/loading/ViewSkeleton";
import {
  AdminAccessPage,
  AdminActivityPage,
  AdminAuditPage,
  AdminLayout,
  AdminBoardPage,
  AdminBoardsPage,
  AdminDashboardPage,
  AdminFlowPage,
  AdminKpiPage,
  AdminLeaderboardsPage,
  AdminSpacePage,
  AdminSpacesPage,
  AdminUserPage,
  AdminUsersPage,
  BoardPage,
  BoardSettingsDetailsPage,
  BoardSettingsFeaturesPage,
  BoardSettingsIntegrationsPage,
  FilterPage,
  ManageBoardsPage,
  ForgotPasswordPage,
  InvitePage,
  ProfilePage,
  RegisterPage,
  ResetPasswordPage,
  SpaceSettingsPage,
  VerifyEmailPage,
  TaskRefPage,
} from "./lazyPages";

// login/ForYou stay eager since they're the first paint; error pages stay eager since a failed lazy import inside one is a dead end
const deferred = (element: ReactNode, fallback: ReactNode = <Loading />) => (
  <Suspense fallback={fallback}>{element}</Suspense>
);

const adminPage = (path: string, element: ReactNode) => ({
  path,
  element,
  errorElement: <RouteErrorPage />,
});

export const router = createBrowserRouter([
  {
    element: <ProtectedRoute />,
    errorElement: <RouteErrorPage />,
    children: [
      // One shell for the pages that share the sidebar, so moving between them
      // keeps it mounted. errorElement sits on each child, not here, so a page
      // that throws keeps the sidebar as its way out.
      {
        element: (
          <Layout>
            <Outlet />
          </Layout>
        ),
        children: [
          // "/" is the personal hub, not a redirect to an arbitrary board
          {
            path: "/",
            element: <ForYouPage />,
            errorElement: <RouteErrorPage />,
          },
          {
            path: "/boards/:boardId",
            element: deferred(<BoardPage />, <BoardPageSkeleton />),
            errorElement: <RouteErrorPage />,
          },
          {
            path: "/filters/:filterId",
            element: deferred(
              <FilterPage />,
              <div className="mx-auto w-full max-w-4xl px-5 pt-16 md:px-6">
                <RowsSkeleton rows={6} />
              </div>,
            ),
            errorElement: <RouteErrorPage />,
          },
        ],
      },
      {
        path: "/boards",
        element: deferred(<ManageBoardsPage />),
      },
      // Flat, not nested under the board — each settings page renders the
      // shell itself.
      // The param stays :boardId because useBoardId and usePermissions read it.
      {
        path: "/boards/:boardId/settings",
        element: <Navigate to="details" replace />,
      },
      {
        path: "/boards/:boardId/settings/details",
        element: deferred(<BoardSettingsDetailsPage />),
      },
      {
        path: "/boards/:boardId/settings/features",
        element: deferred(<BoardSettingsFeaturesPage />),
      },
      {
        path: "/boards/:boardId/settings/integrations",
        element: deferred(<BoardSettingsIntegrationsPage />),
      },
      {
        path: "/spaces/:spaceId/settings",
        element: deferred(<SpaceSettingsPage />),
      },
      {
        path: "/tasks/:ref",
        element: deferred(<TaskRefPage />),
      },
      {
        path: "/profile",
        element: deferred(<ProfilePage />),
      },

      // Nested inside ProtectedRoute so sign-in and verification still run
      // first; the layout and every page are lazy, so a normal user never
      // fetches the bundle. The layout holds the Suspense for its pages, so
      // the admin chrome stays up while one loads, and errorElement sits on
      // each page for the reason it does in the app shell above.
      {
        element: <SuperadminRoute />,
        children: [
          {
            element: deferred(<AdminLayout />),
            children: [
              adminPage("/admin", <AdminDashboardPage />),
              adminPage("/admin/flow", <AdminFlowPage />),
              adminPage("/admin/leaderboards", <AdminLeaderboardsPage />),
              adminPage("/admin/users", <AdminUsersPage />),
              adminPage("/admin/users/:id", <AdminUserPage />),
              adminPage("/admin/boards", <AdminBoardsPage />),
              adminPage("/admin/boards/:id", <AdminBoardPage />),
              adminPage("/admin/spaces", <AdminSpacesPage />),
              adminPage("/admin/spaces/:id", <AdminSpacePage />),
              adminPage("/admin/activity", <AdminActivityPage />),
              adminPage("/admin/kpi", <AdminKpiPage />),
              adminPage("/admin/access", <AdminAccessPage />),
              adminPage("/admin/audit", <AdminAuditPage />),
            ],
          },
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

  // outside both guards, like the reset link
  {
    path: "/verify-email",
    element: deferred(<VerifyEmailPage />),
    errorElement: <RouteErrorPage />,
  },

  // outside both guards — a bad URL should say so, not bounce to /login
  {
    path: "*",
    element: <NotFoundPage />,
    errorElement: <RouteErrorPage />,
  },
]);
