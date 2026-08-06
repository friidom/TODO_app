import { createBrowserRouter } from "react-router";

import ProtectedRoute from "./ProtectedRoute";
import BoardIndexRoute from "./BoardIndexRoute";
import RegisterPage from "@/pages/auth/RegisterPage";
import LoginPage from "@/pages/auth/LoginPage";
import PublicRoute from "./PublicRoute";
import BoardPage from "@/pages/board/BoardPage";
import ProfilePage from "@/pages/profile/ProfilePage";
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

  // Outside both guards on purpose: a signed-out visitor to a bad URL should
  // be told the page does not exist, not bounced to /login as if it did.
  {
    path: "*",
    element: <NotFoundPage />,
    errorElement: <RouteErrorPage />,
  },
]);
