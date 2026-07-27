import { createBrowserRouter } from "react-router";
import App from "../../App";

import ProtectedRoute from "./ProtectedRoute";
import RegisterPage from "../pages/auth/RegisterPage";
import LoginPage from "../pages/auth/LoginPage";
import PublicRoute from "./PublicRoute";
import ProfilePage from "../pages/profile/ProfilePage";

export const router = createBrowserRouter([
  {
    element: <ProtectedRoute />,
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
  
]);
