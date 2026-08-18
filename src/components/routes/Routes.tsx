import { Suspense, type ReactNode } from "react";
import { createBrowserRouter } from "react-router";

import ProtectedRoute from "./ProtectedRoute";
import BoardIndexRoute from "./BoardIndexRoute";
import PublicRoute from "./PublicRoute";
import LoginPage from "@/pages/auth/LoginPage";
import NotFoundPage from "@/pages/error/NotFoundPage";
import RouteErrorPage from "@/pages/error/RouteErrorPage";
import Loading from "@/components/loading/LoadingPage";
import { BoardPage, InvitePage, ProfilePage, RegisterPage } from "./lazyPages";

/**
 * The split (M9-03), and what governs which side of it a route lands on.
 *
 * `docs/FRONTEND.md` asks for *"lazy loading for large routes"*, and on this
 * app that is very nearly one route. `BoardPage` reaches @dnd-kit, five view
 * renderers, the comment thread, the activity drawer and every board modal;
 * everything else is a form or a sentence. Splitting it is most of the win, and
 * splitting the rest is what stops it being clawed back the next time one of
 * them grows.
 *
 * **Four routes stay eager, each for a reason rather than by omission:**
 *
 *   · `LoginPage` is the first paint for a signed-out visitor. Deferring it
 *     buys nothing — it *is* the initial bundle's job — and costs a spinner on
 *     the one screen that should feel instant.
 *   · `BoardIndexRoute` is the first paint for a signed-in one, and it only
 *     picks a board.
 *   · `NotFoundPage` and `RouteErrorPage` are the error paths. A page whose
 *     job is to work when something else did not must not itself depend on a
 *     chunk request succeeding — a failed lazy import inside an error boundary
 *     is a blank screen with no way out.
 */
const deferred = (element: ReactNode) => (
  <Suspense fallback={<Loading />}>{element}</Suspense>
);

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
        element: deferred(<BoardPage />),
      },
      {
        path: "/profile",
        element: deferred(<ProfilePage />),
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
    ],
  },

  // Outside both guards on purpose, and the only page that is: it has to work
  // signed in AND signed out. ProtectedRoute would bounce a signed-out visitor
  // to /login and lose the token; PublicRoute would bounce a signed-in one to
  // /. The page gates itself and carries the token through login via `?next=`.
  {
    path: "/invite/:token",
    element: deferred(<InvitePage />),
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
