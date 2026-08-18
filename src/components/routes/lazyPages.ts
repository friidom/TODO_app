import { lazy } from "react";

/**
 * The route components that are fetched on demand (M9-03).
 *
 * **Their own module, and the reason is a lint rule rather than taste.**
 * `react-refresh/only-export-components` cannot fast-refresh a file that mixes
 * component exports with anything else, and `Routes.tsx` exports the router —
 * which is not a component. It is the same split, for the same rule, that
 * `providers/themeContext.ts` and `providers/authContext.ts` already are.
 *
 * Which routes are here and which stayed eager is argued in `Routes.tsx`, next
 * to the router that uses them.
 */

export const BoardPage = lazy(() => import("@/pages/board/BoardPage"));

export const ProfilePage = lazy(() => import("@/pages/profile/ProfilePage"));

export const InvitePage = lazy(() => import("@/pages/invite/InvitePage"));

export const RegisterPage = lazy(() => import("@/pages/auth/RegisterPage"));
