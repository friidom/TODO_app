import { lazy } from "react";

// own module because react-refresh/only-export-components can't fast-refresh a file mixing components with the router export
export const BoardPage = lazy(() => import("@/pages/board/BoardPage"));

export const ProfilePage = lazy(() => import("@/pages/profile/ProfilePage"));

export const FilterPage = lazy(() => import("@/pages/filters/FilterPage"));

export const ManageBoardsPage = lazy(
  () => import("@/pages/boards/ManageBoardsPage"),
);

export const BoardSettingsDetailsPage = lazy(
  () => import("@/pages/boardSettings/BoardSettingsDetailsPage"),
);

export const BoardSettingsFeaturesPage = lazy(
  () => import("@/pages/boardSettings/BoardSettingsFeaturesPage"),
);

export const InvitePage = lazy(() => import("@/pages/invite/InvitePage"));

export const RegisterPage = lazy(() => import("@/pages/auth/RegisterPage"));

export const ForgotPasswordPage = lazy(
  () => import("@/pages/auth/ForgotPasswordPage"),
);

export const ResetPasswordPage = lazy(
  () => import("@/pages/auth/ResetPasswordPage"),
);

export const AdminDashboardPage = lazy(() => import("@/pages/admin/AdminDashboardPage"));

export const AdminFlowPage = lazy(() => import("@/pages/admin/AdminFlowPage"));

export const AdminLeaderboardsPage = lazy(() => import("@/pages/admin/AdminLeaderboardsPage"));

export const AdminSpacesPage = lazy(() => import("@/pages/admin/AdminSpacesPage"));

export const AdminSpacePage = lazy(() => import("@/pages/admin/AdminSpacePage"));

export const AdminBoardPage = lazy(() => import("@/pages/admin/AdminBoardPage"));

export const AdminUsersPage = lazy(() => import("@/pages/admin/AdminUsersPage"));

export const AdminUserPage = lazy(() => import("@/pages/admin/AdminUserPage"));

export const AdminBoardsPage = lazy(() => import("@/pages/admin/AdminBoardsPage"));

export const AdminActivityPage = lazy(() => import("@/pages/admin/AdminActivityPage"));

export const AdminKpiPage = lazy(() => import("@/pages/admin/AdminKpiPage"));
