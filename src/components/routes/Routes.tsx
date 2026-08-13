import { createBrowserRouter } from "react-router";

import ProtectedRoute from "./ProtectedRoute";
import BoardIndexRoute from "./BoardIndexRoute";
import RegisterPage from "@/pages/auth/RegisterPage";
import LoginPage from "@/pages/auth/LoginPage";
import PublicRoute from "./PublicRoute";
import BoardPage from "@/pages/board/BoardPage";
import ProfilePage from "@/pages/profile/ProfilePage";
import InvitePage from "@/pages/invite/InvitePage";
import NotFoundPage from "@/pages/error/NotFoundPage";
import RouteErrorPage from "@/pages/error/RouteErrorPage";

export const router = createBrowserRouter([
  {
    element: <ProtectedRoute />,
    errorElement: <RouteErrorPage />,
    children: [
      // `/` no longer renders a board, it picks one. The board itself is
      // always addressed by id, so every open board has a shareable URL and
      // the app has one answer to "which board is this".
      {
        path: "/",
        element: <BoardIndexRoute />,
      },
      {
        path: "/boards/:boardId",
        element: <BoardPage />,
      },
      {
        path: "/profile",
        element: <ProfilePage />,
      },
    ],
  },

  {
    element: <PublicRoute />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        path: "/register",
        element: <RegisterPage />,
      },
      {
        path: "/login",
        element: <LoginPage />,
      },
    ],
  },

  // Outside both guards on purpose, and the only page that is: it has to work
  // signed in AND signed out. ProtectedRoute would bounce a signed-out visitor
  // to /login and lose the token; PublicRoute would bounce a signed-in one to
  // /. The page gates itself and carries the token through login via `?next=`.
  {
    path: "/invite/:token",
    element: <InvitePage />,
    errorElement: <RouteErrorPage />,
  },

  // Outside both guards on purpose: a signed-out visitor to a bad URL should
  // be told the page does not exist, not bounced to /login as if it did.
  {
    path: "*",
    element: <NotFoundPage />,
    errorElement: <RouteErrorPage />,
  },
]);
