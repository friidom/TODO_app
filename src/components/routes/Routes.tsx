import { createBrowserRouter } from "react-router";
import App from "../../App";

import ProtectedRoute from "./ProtectedRoute";
import RegisterPage from "../pages/auth/RegisterPage";
import LoginPage from "../pages/auth/LoginPage";
import PublicRoute from "./PublicRoute";
import ProfilePage from "../pages/profile/ProfilePage";
import NotFoundPage from "../pages/error/NotFoundPage";
import RouteErrorPage from "../pages/error/RouteErrorPage";

export const router = createBrowserRouter([
  {
    element: <ProtectedRoute />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        path: "/",
        element: <App />,
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
