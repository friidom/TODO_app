import { lazy } from "react";

// own module because react-refresh/only-export-components can't fast-refresh a file mixing components with the router export
export const BoardPage = lazy(() => import("@/pages/board/BoardPage"));

export const ProfilePage = lazy(() => import("@/pages/profile/ProfilePage"));

export const InvitePage = lazy(() => import("@/pages/invite/InvitePage"));

export const RegisterPage = lazy(() => import("@/pages/auth/RegisterPage"));

export const ForgotPasswordPage = lazy(
  () => import("@/pages/auth/ForgotPasswordPage"),
);

export const ResetPasswordPage = lazy(
  () => import("@/pages/auth/ResetPasswordPage"),
);
