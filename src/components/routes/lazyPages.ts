import { createElement, lazy, useState, type ComponentType } from "react";

// React.lazy suspends on its first render even when the module has already
// arrived, and a Suspense fallback that commits holds the page back by React's
// reveal throttle (~300ms). Once loaded, the page renders directly instead.
// Chosen once per mount: switching type later would remount the page.
function preloadable(load: () => Promise<{ default: ComponentType }>) {
  let loaded: ComponentType | null = null;

  const preload = () =>
    load().then((module) => {
      loaded = module.default;

      return module;
    });

  const Lazy = lazy(preload);

  function Page() {
    const [Component] = useState<ComponentType>(() => loaded ?? Lazy);

    return createElement(Component);
  }

  return { Page, preload };
}

// own module because react-refresh/only-export-components can't fast-refresh a file mixing components with the router export
const board = preloadable(() => import("@/pages/board/BoardPage"));

export const BoardPage = board.Page;

// Most reloads land on a board; fetch its chunk beside the session refresh
// instead of after it.
if (/^\/boards\/[^/]+\/?$/.test(window.location.pathname)) void board.preload();

export const ProfilePage = lazy(() => import("@/pages/profile/ProfilePage"));

export const FilterPage = lazy(() => import("@/pages/filters/FilterPage"));

export const TaskRefPage = lazy(() => import("@/pages/tasks/TaskRefPage"));

export const ManageBoardsPage = lazy(
  () => import("@/pages/boards/ManageBoardsPage"),
);

export const BoardSettingsDetailsPage = lazy(
  () => import("@/pages/boardSettings/BoardSettingsDetailsPage"),
);

export const BoardSettingsFeaturesPage = lazy(
  () => import("@/pages/boardSettings/BoardSettingsFeaturesPage"),
);

export const BoardSettingsIntegrationsPage = lazy(
  () => import("@/pages/boardSettings/BoardSettingsIntegrationsPage"),
);

export const SpaceSettingsPage = lazy(
  () => import("@/pages/spaceSettings/SpaceSettingsPage"),
);

export const InvitePage = lazy(() => import("@/pages/invite/InvitePage"));

export const RegisterPage = lazy(() => import("@/pages/auth/RegisterPage"));

export const ForgotPasswordPage = lazy(
  () => import("@/pages/auth/ForgotPasswordPage"),
);

export const VerifyEmailPage = lazy(
  () => import("@/pages/auth/VerifyEmailPage"),
);

export const ResetPasswordPage = lazy(
  () => import("@/pages/auth/ResetPasswordPage"),
);

export const AdminDashboardPage = lazy(
  () => import("@/pages/admin/AdminDashboardPage"),
);

export const AdminFlowPage = lazy(() => import("@/pages/admin/AdminFlowPage"));

export const AdminAccessPage = lazy(
  () => import("@/pages/admin/AdminAccessPage"),
);

export const AdminLeaderboardsPage = lazy(
  () => import("@/pages/admin/AdminLeaderboardsPage"),
);

export const AdminSpacesPage = lazy(
  () => import("@/pages/admin/AdminSpacesPage"),
);

export const AdminSpacePage = lazy(
  () => import("@/pages/admin/AdminSpacePage"),
);

export const AdminBoardPage = lazy(
  () => import("@/pages/admin/AdminBoardPage"),
);

export const AdminUsersPage = lazy(
  () => import("@/pages/admin/AdminUsersPage"),
);

export const AdminUserPage = lazy(() => import("@/pages/admin/AdminUserPage"));

export const AdminBoardsPage = lazy(
  () => import("@/pages/admin/AdminBoardsPage"),
);

export const AdminActivityPage = lazy(
  () => import("@/pages/admin/AdminActivityPage"),
);

export const AdminKpiPage = lazy(() => import("@/pages/admin/AdminKpiPage"));
