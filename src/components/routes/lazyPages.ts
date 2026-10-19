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

export const AdminLayout = lazy(() => import("@/components/admin/AdminLayout"));

// Preloadable, and preloaded by AdminLayout once it mounts: moving between
// admin sections then renders at once instead of through a fallback.
const admin = {
  dashboard: preloadable(() => import("@/pages/admin/AdminDashboardPage")),
  flow: preloadable(() => import("@/pages/admin/AdminFlowPage")),
  access: preloadable(() => import("@/pages/admin/AdminAccessPage")),
  audit: preloadable(() => import("@/pages/admin/AdminAuditPage")),
  leaderboards: preloadable(
    () => import("@/pages/admin/AdminLeaderboardsPage"),
  ),
  spaces: preloadable(() => import("@/pages/admin/AdminSpacesPage")),
  space: preloadable(() => import("@/pages/admin/AdminSpacePage")),
  board: preloadable(() => import("@/pages/admin/AdminBoardPage")),
  users: preloadable(() => import("@/pages/admin/AdminUsersPage")),
  user: preloadable(() => import("@/pages/admin/AdminUserPage")),
  boards: preloadable(() => import("@/pages/admin/AdminBoardsPage")),
  activity: preloadable(() => import("@/pages/admin/AdminActivityPage")),
  kpi: preloadable(() => import("@/pages/admin/AdminKpiPage")),
};

export function preloadAdminPages(): void {
  for (const page of Object.values(admin)) void page.preload();
}

export const AdminDashboardPage = admin.dashboard.Page;
export const AdminFlowPage = admin.flow.Page;
export const AdminAccessPage = admin.access.Page;
export const AdminAuditPage = admin.audit.Page;
export const AdminLeaderboardsPage = admin.leaderboards.Page;
export const AdminSpacesPage = admin.spaces.Page;
export const AdminSpacePage = admin.space.Page;
export const AdminBoardPage = admin.board.Page;
export const AdminUsersPage = admin.users.Page;
export const AdminUserPage = admin.user.Page;
export const AdminBoardsPage = admin.boards.Page;
export const AdminActivityPage = admin.activity.Page;
export const AdminKpiPage = admin.kpi.Page;
